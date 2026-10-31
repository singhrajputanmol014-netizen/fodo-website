/* FODO Website Builder, tiny SAFE Markdown (v32, shared): text is escaped first, then only a small subset is formatted
   (## headings, **bold**, *italic*, - lists, [links](https://…), ![images](https://…)). No raw HTML ever. */
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function safeUrl(u) { u = String(u == null ? "" : u).trim(); if (!u || /^javascript:/i.test(u)) return ""; if (/^(https?:\/\/|mailto:|tel:|#)/i.test(u)) return u; if (/^\/api\/sites\/media\/[a-z0-9]{20}$/.test(u)) return u; if (/^[a-z0-9\-\/._?=&]*$/i.test(u) && !/^\/\//.test(u)) return u; return ""; }
export function md(src) {
  const lines = String(src || "").replace(/\r/g, "").split("\n"), out = []; let list = false;
  const inline = (t) => esc(t).replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, a, u) => (safeUrl(u) ? '<img src="' + esc(safeUrl(u)) + '" alt="' + a + '" loading="lazy">' : "")).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, a, u) => (safeUrl(u) ? '<a href="' + esc(safeUrl(u)) + '"' + (/^https?:/.test(u) ? ' rel="noopener" target="_blank"' : "") + ">" + a + "</a>" : a)).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
  for (const l of lines) {
    if (/^\s*[-*]\s+/.test(l)) { if (!list) { out.push("<ul>"); list = true; } out.push("<li>" + inline(l.replace(/^\s*[-*]\s+/, "")) + "</li>"); continue; }
    if (list) { out.push("</ul>"); list = false; }
    if (/^###\s/.test(l)) out.push("<h3>" + inline(l.slice(4)) + "</h3>"); else if (/^##?\s/.test(l)) out.push("<h2>" + inline(l.replace(/^##?\s/, "")) + "</h2>"); else if (l.trim()) out.push("<p>" + inline(l) + "</p>");
  }
  if (list) out.push("</ul>"); return out.join("\n");
}
