/* FODO v52 Studio on fodo.co.in: UI 2.0 from the FODO Studio app (icons for emoji, 3D tilt, count-up numbers, Ctrl K palette).
   Copied from the app's index.html so both look the same. No inline handlers (CSP). */
/* ===== UI 2.0 — Cinematic Studio: icons, 3D depth, motion, command palette ===== */
(function(){
  const root = document.documentElement; root.classList.add('ui2');
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const ICONS = {"home": "<path d=\"M3 10.5 12 3l9 7.5\"/><path d=\"M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5\"/>", "upload": "<path d=\"M12 15V4\"/><path d=\"m7 9 5-5 5 5\"/><path d=\"M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4\"/>", "live": "<circle cx=\"12\" cy=\"12\" r=\"2.2\"/><path d=\"M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2\"/>", "scissors": "<circle cx=\"6\" cy=\"6\" r=\"3\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><path d=\"M8.2 8.2 20 20M14.5 9.5 20 4M8.2 15.8l3.3-3.3\"/>", "sliders": "<path d=\"M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0\"/><circle cx=\"16\" cy=\"6\" r=\"2\"/><circle cx=\"10\" cy=\"12\" r=\"2\"/><circle cx=\"18\" cy=\"18\" r=\"2\"/>", "radar": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"12\" cy=\"12\" r=\"5\"/><path d=\"M12 12 18.4 5.6\"/><circle cx=\"12\" cy=\"12\" r=\"1\" fill=\"currentColor\"/>", "film": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2.5\"/><path d=\"M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4\"/>", "rocket": "<path d=\"M5 15c-1.5 1.3-2 4-2 6 2 0 4.7-.5 6-2\"/><path d=\"M9.5 14.5 7 12c1-4 4.5-8 12-9-1 7.5-5 11-9 12z\"/><circle cx=\"15\" cy=\"9\" r=\"1.6\"/>", "database": "<ellipse cx=\"12\" cy=\"5.5\" rx=\"8\" ry=\"2.8\"/><path d=\"M4 5.5v6c0 1.6 3.6 2.8 8 2.8s8-1.2 8-2.8v-6M4 11.5v7c0 1.6 3.6 2.8 8 2.8s8-1.2 8-2.8v-7\"/>", "pulse": "<path d=\"M3 12h4l2.5-6 5 12L17 12h4\"/>", "wand": "<path d=\"m4 20 11-11M14 4v2M19 9h2M17.5 5.5 19 4M17 3l.5 1.5M20 7l1 .5\"/><path d=\"m13 10 1 1\"/>", "sparkles": "<path d=\"M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z\"/><path d=\"M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z\"/>", "layers": "<path d=\"m12 3 9 5-9 5-9-5z\"/><path d=\"m3 13 9 5 9-5\"/>", "chart": "<path d=\"M4 20V10M10 20V4M16 20v-7M21 20H3\"/>", "gauge": "<path d=\"M4.5 17a9 9 0 1 1 15 0\"/><path d=\"m12 13 4-5\"/><circle cx=\"12\" cy=\"13\" r=\"1.4\"/>", "shield": "<path d=\"M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z\"/><path d=\"m9 12 2 2 4-4\"/>", "grid": "<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"/>", "palette": "<path d=\"M12 3a9 9 0 0 0 0 18c1.1 0 1.5-.8 1.5-1.6 0-1.3-1-1.4-1-2.6 0-.9.7-1.6 1.6-1.6H17a4 4 0 0 0 4-4C21 6.8 17 3 12 3z\"/><circle cx=\"7.5\" cy=\"11\" r=\"1\"/><circle cx=\"10\" cy=\"7\" r=\"1\"/><circle cx=\"15\" cy=\"7\" r=\"1\"/>", "play": "<path d=\"M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z\"/>", "pause": "<rect x=\"6\" y=\"4\" width=\"4\" height=\"16\" rx=\"1\"/><rect x=\"14\" y=\"4\" width=\"4\" height=\"16\" rx=\"1\"/>", "download": "<path d=\"M12 4v11\"/><path d=\"m7 10 5 5 5-5\"/><path d=\"M4 19h16\"/>", "send": "<path d=\"M21 3 10 14\"/><path d=\"m21 3-7 18-4-7-7-4z\"/>", "captions": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2.5\"/><path d=\"M10 10.5a2 2 0 1 0 0 3M16.5 10.5a2 2 0 1 0 0 3\"/>", "hash": "<path d=\"M5 9h15M4 15h15M10 3 8 21M16 3l-2 18\"/>", "undo": "<path d=\"M9 14 4 9l5-5\"/><path d=\"M4 9h10.5a5.5 5.5 0 0 1 0 11H11\"/>", "thumbUp": "<path d=\"M7 10v11H4V10z\"/><path d=\"M7 10l4-7c1.7 0 2.8 1.3 2.4 3L13 9h5.5a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17.1 20H7\"/>", "thumbDown": "<path d=\"M17 14V3h3v11z\"/><path d=\"M17 14l-4 7c-1.7 0-2.8-1.3-2.4-3L11 15H5.5a2 2 0 0 1-2-2.4l1.4-7A2 2 0 0 1 6.9 4H17\"/>", "trim": "<path d=\"M6 3v12a3 3 0 0 0 3 3h12\"/><path d=\"M18 21V9a3 3 0 0 0-3-3H3\"/>", "timeline": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"6\" rx=\"1.5\"/><rect x=\"3\" y=\"14\" width=\"11\" height=\"6\" rx=\"1.5\"/><path d=\"M17 13v8\"/>", "render": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"12\" rx=\"2\"/><path d=\"M8 21h8M12 17v4\"/><path d=\"m10 9 4 2-4 2z\"/>", "phone": "<rect x=\"6\" y=\"2.5\" width=\"12\" height=\"19\" rx=\"2.5\"/><path d=\"M11 18.5h2\"/>", "check": "<path d=\"m4.5 12.5 5 5 10-11\"/>", "checkCircle": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m8 12.5 3 3 5-6\"/>", "x": "<path d=\"M6 6l12 12M18 6 6 18\"/>", "alert": "<path d=\"M12 3 2 20h20z\"/><path d=\"M12 10v4M12 17.5v.01\"/>", "info": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v5M12 7.5v.01\"/>", "calendar": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2.5\"/><path d=\"M3 10h18M8 3v4M16 3v4\"/>", "clock": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>", "link": "<path d=\"M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1\"/><path d=\"M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1\"/>", "folder": "<path d=\"M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/>", "search": "<circle cx=\"11\" cy=\"11\" r=\"6.5\"/><path d=\"m20 20-4.2-4.2\"/>", "refresh": "<path d=\"M20 11a8 8 0 0 0-14.6-4.5L4 8\"/><path d=\"M4 3v5h5\"/><path d=\"M4 13a8 8 0 0 0 14.6 4.5L20 16\"/><path d=\"M20 21v-5h-5\"/>", "plus": "<path d=\"M12 5v14M5 12h14\"/>", "sun": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4\"/>", "moon": "<path d=\"M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z\"/>", "monitor": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"12\" rx=\"2\"/><path d=\"M8 20h8M12 16v4\"/>", "logout": "<path d=\"M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3\"/><path d=\"m10 16-4-4 4-4M6 12h10\"/>", "eye": "<path d=\"M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>", "trash": "<path d=\"M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3\"/>", "edit": "<path d=\"M4 20h4L19 9l-4-4L4 16z\"/><path d=\"m13.5 6.5 4 4\"/>", "copy": "<rect x=\"8\" y=\"8\" width=\"13\" height=\"13\" rx=\"2\"/><path d=\"M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3\"/>", "external": "<path d=\"M14 4h6v6M20 4 11 13\"/><path d=\"M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5\"/>", "chevDown": "<path d=\"m6 9 6 6 6-6\"/>", "chevRight": "<path d=\"m9 6 6 6-6 6\"/>", "music": "<path d=\"M9 18V5l11-2v13\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><circle cx=\"17\" cy=\"16\" r=\"3\"/>", "volume": "<path d=\"M4 9v6h4l5 4V5L8 9z\"/><path d=\"M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12\"/>", "image": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2.5\"/><circle cx=\"8.5\" cy=\"9.5\" r=\"1.8\"/><path d=\"m21 16-5-5-9 9\"/>", "type": "<path d=\"M5 6V4h14v2M12 4v16M9 20h6\"/>", "target": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"12\" cy=\"12\" r=\"5\"/><circle cx=\"12\" cy=\"12\" r=\"1.2\"/>", "flame": "<path d=\"M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1-3.8 2.2-5 .2 1.6 1 2.5 1.8 3 .2-3.5 1-5.8 1-8z\"/>", "bolt": "<path d=\"M13 3 4 14h7l-1 7 9-11h-7z\"/>", "user": "<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21a8 8 0 0 1 16 0\"/>", "settings": "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z\"/>", "box": "<path d=\"m21 8-9-5-9 5 9 5z\"/><path d=\"M3 8v8l9 5 9-5V8M12 13v8\"/>", "star": "<path d=\"m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z\"/>", "tv": "<rect x=\"3\" y=\"6\" width=\"18\" height=\"13\" rx=\"2\"/><path d=\"m8 3 4 3 4-3\"/>", "mic": "<rect x=\"9\" y=\"3\" width=\"6\" height=\"11\" rx=\"3\"/><path d=\"M5 11a7 7 0 0 0 14 0M12 18v3\"/>", "gamepad": "<rect x=\"2.5\" y=\"7\" width=\"19\" height=\"11\" rx=\"5\"/><path d=\"M7 11v3M5.5 12.5h3\"/><circle cx=\"15.5\" cy=\"11.5\" r=\".9\"/><circle cx=\"17.5\" cy=\"13.5\" r=\".9\"/>", "globe": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18\"/>", "pin": "<path d=\"M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z\"/><circle cx=\"12\" cy=\"9.5\" r=\"2.5\"/>", "tag": "<path d=\"M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z\"/><circle cx=\"7.5\" cy=\"7.5\" r=\"1.3\"/>", "brain": "<path d=\"M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1\"/>", "hourglass": "<path d=\"M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9\"/>", "cloud": "<path d=\"M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.5 4.3 4.3 0 0 1 17.5 18z\"/>"};
  const EMO = {"🏠": "home", "⬆️": "upload", "⬆": "upload", "📤": "upload", "✂️": "scissors", "✂": "scissors", "🎛️": "sliders", "🎛": "sliders", "🧭": "radar", "🎬": "film", "🎞️": "film", "🎞": "film", "🎥": "film", "📹": "film", "🚀": "rocket", "🗂️": "database", "🗂": "database", "💾": "database", "⚡": "bolt", "📈": "chart", "📊": "chart", "🛠️": "settings", "🛠": "settings", "⚙️": "settings", "⚙": "settings", "🔗": "link", "📁": "folder", "📂": "folder", "🔍": "search", "🔎": "search", "✨": "sparkles", "🤖": "sparkles", "🔴": "live", "📡": "live", "🎯": "target", "⏪": "undo", "↶": "undo", "↩️": "undo", "↩": "undo", "🎵": "music", "🎶": "music", "🎧": "music", "🔊": "volume", "🔉": "volume", "🎨": "palette", "📱": "phone", "⬇️": "download", "⬇": "download", "📥": "download", "▶️": "play", "▶": "play", "⏸️": "pause", "⏸": "pause", "↻": "refresh", "🔄": "refresh", "🔁": "refresh", "✓": "check", "✔️": "check", "✔": "check", "✅": "checkCircle", "❌": "x", "✖": "x", "✕": "x", "⚠️": "alert", "⚠": "alert", "⛔": "alert", "🚫": "alert", "❗": "alert", "🗓️": "calendar", "🗓": "calendar", "📅": "calendar", "📆": "calendar", "⏳": "hourglass", "⌛": "hourglass", "🕒": "clock", "🕓": "clock", "⏱️": "clock", "⏱": "clock", "⏰": "clock", "🕐": "clock", "📍": "pin", "📌": "pin", "🏷️": "tag", "🏷": "tag", "🧠": "brain", "🖼️": "image", "🖼": "image", "📸": "image", "📷": "image", "🔤": "type", "💬": "captions", "🎤": "mic", "🎙️": "mic", "🎙": "mic", "🎮": "gamepad", "🌍": "globe", "🌐": "globe", "👍": "thumbUp", "👎": "thumbDown", "🗑️": "trash", "🗑": "trash", "✏️": "edit", "✏": "edit", "✍️": "edit", "✍": "edit", "📝": "edit", "📋": "copy", "🔥": "flame", "💡": "bolt", "📦": "box", "⭐": "star", "★": "star", "📺": "tv", "🔒": "shield", "🛡️": "shield", "🛡": "shield", "☀️": "sun", "☀": "sun", "🌙": "moon", "🖥️": "monitor", "🖥": "monitor", "💻": "monitor", "👁️": "eye", "👁": "eye", "📣": "send", "📢": "send", "📨": "send", "🧩": "grid", "◆": "layers", "☰": "layers", "🏁": "checkCircle", "🔔": "info", "ℹ️": "info", "ℹ": "info", "👤": "user", "👥": "user", "📎": "link", "⤓": "download", "🎚️": "sliders", "🎚": "sliders", "🪄": "wand", "🧪": "target", "📑": "copy", "🗃️": "box", "🗃": "box", "☁️": "cloud", "☁": "cloud", "🧲": "target", "💰": "chart", "🗞️": "type", "＋": "plus", "➕": "plus", "🔀": "refresh", "⭳": "download", "↗": "external", "⟲": "refresh", "💧": "image", "🅣": "type", "📐": "trim", "🏆": "star", "🎉": "sparkles", "👀": "eye", "📏": "trim", "🧷": "link", "🧾": "copy", "🗒️": "edit", "🗒": "edit", "🎼": "music", "🗣️": "mic", "🗣": "mic", "⚽": "bolt", "📰": "type", "↷": "refresh", "↺": "refresh", "🔧": "settings", "▾": "chevDown", "⛶": "monitor", "🩺": "shield", "🧰": "box", "⏮": "undo", "📮": "send", "✎": "edit", "☆": "star", "✚": "plus", "💥": "flame", "↔": "trim", "⏩": "play", "🧑‍💼": "user", "🎓": "star", "🕹️": "gamepad", "🕹": "gamepad", "🛫": "globe", "✈️": "globe", "🍳": "flame", "💪": "bolt", "🏋️": "bolt"};
  const ico = (n, cls='') => ICONS[n] ? `<svg class="uic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>` : '';
  window.uiIcon = ico;
  const NAVI = {posts:'rocket',inbox:'send',clients:'user',clipping:'scissors',planner:'brain',bio:'link',calendar:'calendar',editor:'sliders',captions:'type',dash:'home',import:'upload',clips:'scissors',editor:'sliders',tracker:'radar',exports:'film',publish:'rocket',library:'database',
    activity:'pulse',studio:'type',templates:'layers',batch:'grid',analytics:'chart',panel:'gauge',admin:'settings'};
  const keys = Object.keys(EMO).sort((a,b)=>b.length-a.length);
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const LEAD = new RegExp('^(\\s*)(' + keys.map(esc).join('|') + ')\\uFE0F?\\s*');
  const CHROME = '.edml-ic,#v-publish b,.pchip b,button,.btn,.nav,.badge,.pst,.pill,.srck,h1,h2,h3,h4,summary,.navsec,.tl span,.qtile span,.ltype b,.preset b,label,.edtype .ic,.mchip,.edchip,.pcheck,th,.k,.lab,.hint,.edrail button,.pubtabs button,.themebar button,.toast,.prov,.reason,legend,.pmini,.cpy';
  const SKIP = 'textarea,input,select,[contenteditable],.edl,.ui2-noicon,pre,code,script,style';

  function convertText(node){
    let txt = node.nodeValue, out = '', m, n = 0;
    if (!txt || !txt.trim()) return false;
    // AI-ish buttons get the aurora treatment (decided before the emoji is swapped)
    while ((m = LEAD.exec(txt)) && n < 3) { out += ico(EMO[m[2]]) || ''; txt = txt.slice(m[0].length); n++; if (!out) break; }
    if (!n || !out) return false;
    const span = document.createElement('span'); span.className = 'ui2-i'; span.style.display = 'contents';
    span.innerHTML = out + (txt ? ' ' : ''); span.appendChild(document.createTextNode(txt));
    node.parentNode.replaceChild(span, node); return true;
  }
  function markAI(el){
    if (!el.matches || !el.matches('button.btn,.btn') || el.classList.contains('danger') || el.dataset.ui2ai) return;
    el.dataset.ui2ai = '1';
    const t = el.textContent || '';
    if (/^\s*(✨|🤖|🪄)/.test(t) || /\b(Ask AI|Rewrite|AI caption|with AI|Auto-clip|Re-detect)\b/i.test(t)) el.classList.add('ai');
  }
  function walk(scope){
    if (!scope || scope.nodeType !== 1) return;
    const els = scope.matches && scope.matches(CHROME) ? [scope, ...scope.querySelectorAll(CHROME)] : scope.querySelectorAll(CHROME);
    for (const el of els) {
      if (el.closest(SKIP)) continue;
      markAI(el);
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {acceptNode: t => t.parentElement && !t.parentElement.closest(SKIP) && !t.parentElement.closest('.ui2-i') ? 1 : 2});
      const list = []; let t; while ((t = tw.nextNode())) list.push(t);
      for (const tn of list) convertText(tn);
    }
    for (const b of scope.querySelectorAll ? scope.querySelectorAll('.nav[data-v]>i') : []) {
      const v = b.parentElement.dataset.v; if (NAVI[v] && !b.dataset.ui2) { b.innerHTML = ico(NAVI[v]); b.dataset.ui2 = 1; }
    }
  }
  let pend = new Set(), sched = false;
  function flush(){ sched = false; const s = [...pend]; pend.clear(); for (const n of s) if (n.isConnected) { walk(n); tiltScan(n); countScan(n); } }
  const mo = new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) { if (n.nodeType === 1) pend.add(n); else if (n.nodeType === 3 && n.parentElement) pend.add(n.parentElement); }
    if (pend.size && !sched) { sched = true; requestAnimationFrame(flush); } });

  /* ---------- 3D tilt + spotlight ---------- */
  const TILT = '.qtile,.kpi,.pcard,.gauge,.preset,.scard,.edtype,.ltype,#projList>.card,.trrow,.excard,.edclip,.pchip';
  function tiltScan(scope){ if (!scope.querySelectorAll) return; for (const el of scope.querySelectorAll(TILT)) el.classList.add('tilt'); if (scope.matches && scope.matches(TILT)) scope.classList.add('tilt'); }
  let tEl = null, raf = 0, lastE = null;
  function onMove(e){
    lastE = e; if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; const ev = lastE;
      const card = ev.target.closest && ev.target.closest('.card,.kpi,.qtile,.pcard,.gauge');
      if (card) { const r = card.getBoundingClientRect(); card.style.setProperty('--mx', (ev.clientX - r.left) + 'px'); card.style.setProperty('--my', (ev.clientY - r.top) + 'px'); }
      const el = ev.target.closest && ev.target.closest('.tilt');
      if (tEl && tEl !== el) { tEl.style.transform = ''; tEl = null; }
      if (!el || RM.matches) return;
      const r = el.getBoundingClientRect(); const max = Math.max(1.2, Math.min(6, 6 * 260 / r.width));
      const px = (ev.clientX - r.left) / r.width - .5, py = (ev.clientY - r.top) / r.height - .5;
      el.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) translateY(-2px)`;
      tEl = el;
      const rig = document.querySelector('.hstack .rig');
      if (rig && ev.target.closest('.hero')) { const hr = ev.target.closest('.hero').getBoundingClientRect(); const hx = (ev.clientX - hr.left) / hr.width - .5, hy = (ev.clientY - hr.top) / hr.height - .5;
        rig.style.transform = `rotateY(${hx * 16}deg) rotateX(${-hy * 10}deg)`; }
    });
  }
  document.addEventListener('pointermove', onMove, {passive:true});
  document.addEventListener('pointerleave', () => { if (tEl) { tEl.style.transform = ''; tEl = null; } });

  /* ---------- count-up numbers ---------- */
  const seen = new WeakSet();
  function countScan(scope){
    if (RM.matches || !scope.querySelectorAll) return;
    for (const el of scope.querySelectorAll('.kpi .v,.gauge .gv')) {
      if (seen.has(el)) continue; seen.add(el);
      const raw = el.textContent.trim(); const m = raw.match(/^([^\d-]*)([\d,]+(?:\.\d+)?)(.*)$/); if (!m) continue;
      const target = parseFloat(m[2].replace(/,/g,'')); if (!isFinite(target) || target === 0) continue;
      const dec = (m[2].split('.')[1] || '').length, comma = m[2].includes(','), t0 = performance.now(), dur = 900;
      const fmt = v => { let s = v.toFixed(dec); if (comma) s = Number(s).toLocaleString('en-US', {minimumFractionDigits:dec, maximumFractionDigits:dec}); return m[1] + s + m[3]; };
      const step = now => { const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(p === 1 ? target : target * e); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
  }

  /* ---------- page transitions ---------- */
  function enter(v){ const el = document.getElementById('v-' + v); if (!el || RM.matches) return; el.classList.remove('ui2-enter'); void el.offsetWidth; el.classList.add('ui2-enter');
    setTimeout(() => el.classList.remove('ui2-enter'), 900); }

  /* ---------- hero, brand, login ---------- */
  function decorate(){
    const bm = document.querySelector('.bmark'); if (bm && !bm.dataset.ui2) { bm.dataset.ui2 = 1; bm.innerHTML = ico('scissors'); }
    const lg = document.querySelector('.logo'); if (lg && !lg.dataset.ui2) { lg.dataset.ui2 = 1; lg.innerHTML = 'FODO Studio'; }
    const tg = document.querySelector('.brand .tag'); if (tg) tg.textContent = 'Social · Studio · Marketing';
    const hero = document.querySelector('#v-dash .hero');
    if (hero && !hero.dataset.ui2) { hero.dataset.ui2 = 1;
      const h = hero.querySelector('h1'), s = hero.querySelector('.sub');
      if (h) { h.innerHTML = 'Turn long streams into <em>scroll&#8209;stopping clips.</em>';
        const eb = document.createElement('div'); eb.className = 'hero-eyebrow'; eb.textContent = 'AI clipping · one of the Studio tools'; h.parentElement.insertBefore(eb, h); }
      if (s) s.textContent = 'Paste a link, drop a file or watch a live stream — ClipForge finds the moments, cuts them vertical, writes the caption and posts everywhere.';
      const st = document.createElement('div'); st.className = 'hstack'; st.setAttribute('aria-hidden','true');
      const pl = `<div class="pl"><svg viewBox="0 0 24 24">${ICONS.play.replace(/<path /,'<path fill="#fff" ')}</svg></div><i class="cp1"></i><i class="cp2"></i>`;
      st.innerHTML = `<div class="rig"><div class="hcard c1">${pl}</div><div class="hcard c2">${pl}</div><div class="hcard c3">${pl}</div></div>`;
      hero.appendChild(st);
    }
    const lv = document.getElementById('loginView');
    if (lv && !lv.dataset.ui2) { lv.dataset.ui2 = 1; const first = lv.firstElementChild;
      if (first && !first.classList.contains('login-card')) { first.outerHTML = `<div style="text-align:center"><div class="lg-mark">${ico('scissors')}</div><div class="lg-title">FODO <span>ClipForge</span> AI</div></div>`; } }
    // command palette hint under the brand
    const side = document.querySelector('.side .brand');
    if (side && !document.querySelector('.cmdk-hint')) { const b = document.createElement('button'); b.className = 'cmdk-hint'; b.type = 'button';
      b.innerHTML = ico('search') + '<span>Jump to…</span><kbd>Ctrl K</kbd>'; b.onclick = openK; side.after(b); }
  }

  /* ---------- command palette (Ctrl/⌘ K) ---------- */
  let K = null, kSel = 0, kItems = [];
  function buildK(){
    K = document.createElement('div'); K.className = 'cmdk'; K.innerHTML = '<div class="box"><input placeholder="Search pages and actions…" aria-label="Command palette"><div class="list"></div></div>';
    document.body.appendChild(K);
    K.addEventListener('click', e => { if (e.target === K) closeK(); });
    const inp = K.querySelector('input');
    inp.addEventListener('input', () => { kSel = 0; renderK(); });
    inp.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { kSel = Math.min(kSel + 1, kItems.length - 1); renderK(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { kSel = Math.max(kSel - 1, 0); renderK(); e.preventDefault(); }
      else if (e.key === 'Enter') { const it = kItems[kSel]; if (it) { closeK(); it.run(); } } else if (e.key === 'Escape') closeK(); });
  }
  function sources(){
    const out = [];
    for (const b of document.querySelectorAll('.nav[data-v]')) { if (b.style.display === 'none') continue; const v = b.dataset.v;
      out.push({label: b.textContent.trim().replace(/\s+\d+$/, ''), icon: NAVI[v] || 'chevRight', hint: 'Page', run: () => window.nav && window.nav(v)}); }
    out.push({label:'Switch to dark theme', icon:'moon', hint:'Theme', run: () => window.setTheme && setTheme('dark')});
    out.push({label:'Switch to light theme', icon:'sun', hint:'Theme', run: () => window.setTheme && setTheme('light')});
    return out;
  }
  function renderK(){ const q = K.querySelector('input').value.toLowerCase().trim();
    kItems = sources().filter(i => !q || i.label.toLowerCase().includes(q));
    K.querySelector('.list').innerHTML = kItems.map((it, i) => `<div class="it${i===kSel?' on':''}" data-i="${i}">${ico(it.icon)}<span>${it.label.replace(/</g,'&lt;')}</span><kbd>${it.hint}</kbd></div>`).join('') || '<div class="it">No match</div>';
    for (const d of K.querySelectorAll('.it[data-i]')) d.onclick = () => { const it = kItems[+d.dataset.i]; closeK(); it.run(); };
  }
  function openK(){ if (!K) buildK(); K.classList.add('on'); const i = K.querySelector('input'); i.value = ''; kSel = 0; renderK(); setTimeout(() => i.focus(), 20); }
  function closeK(){ K && K.classList.remove('on'); }
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { const app = document.getElementById('appView'); if (app && getComputedStyle(app).display !== 'none') { e.preventDefault(); K && K.classList.contains('on') ? closeK() : openK(); } } });

  /* ---------- boot ---------- */
  function boot(){
    decorate(); walk(document.body); tiltScan(document.body); countScan(document.body);
    mo.observe(document.body, {childList:true, subtree:true});
    if (typeof window.nav === 'function' && !window.nav.ui2) { const _nav = window.nav; const w = function(v){ const r = _nav.apply(this, arguments); try { enter(v); } catch(e){} return r; }; w.ui2 = true; window.nav = w; }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
