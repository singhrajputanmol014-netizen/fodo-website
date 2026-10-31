/* FODO Competitor Finder — exports that work everywhere (v11)
   • Excel (.xlsx) is written right here (no outside library, no CDN): a real Office Open XML workbook with a bold header row,
     filters, frozen first row + name column and column widths. CSV is UTF-8 with a BOM so Excel reads Hindi/accents correctly.
   • Phones and in-app browsers: a file made inside a page (blob: link) is often ignored by Instagram / Facebook / LinkedIn
     browsers and some Android webviews — the user taps "Download" and nothing lands in Files. So on phones we offer:
       1. "Save or share file" — the phone's own share sheet (Save to Files, Drive, WhatsApp, Mail …), when supported;
       2. "Download" — the file is handed to /api/export and opened as a normal web download (works in every browser);
       3. "Copy for Google Sheets" — with a select-and-copy box when the clipboard is blocked.
   • The sheet is kept in IndexedDB (hundreds of MB allowed) instead of localStorage (5 MB, failed silently before).
   • PDF reports are written here too (text PDF with headings and page numbers — not a screenshot).
   window.FODO_EXPORT = { xlsx, pdf, csv, tsv, deliver, copyText, store, isPhone, inApp } */
(function () {
  "use strict";
  var ROOT = (window.FODO_UTIL && window.FODO_UTIL.root) || "/";
  var enc = new TextEncoder();

  /* ---------- tiny ZIP writer (stored, no compression — Excel opens it fine) ---------- */
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {   // files: [{ name, data: Uint8Array }]
    var d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    var parts = [], central = [], off = 0;
    files.forEach(function (f) {
      var nm = enc.encode(f.name), crc = crc32(f.data), h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, time, true); h.setUint16(12, date, true);
      h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), nm, f.data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, time, true); c.setUint16(14, date, true);
      c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), nm);
      off += 30 + nm.length + f.data.length;
    });
    var csize = central.reduce(function (s, x) { return s + x.length; }, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  /* ---------- XLSX ---------- */
  var xml = function (s) { return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "").replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "$1").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
  var colName = function (i) { var s = ""; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  var sheetName = function (s, used) { var n = String(s || "Sheet").replace(/[\[\]:*?\/\\]/g, " ").slice(0, 31).trim() || "Sheet", b = n, k = 2; while (used[n.toLowerCase()]) n = b.slice(0, 28) + " " + k++; used[n.toLowerCase()] = 1; return n; };
  function sheetXML(sh) {
    var rows = sh.rows || [], ncol = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 1), head = sh.header !== false && rows.length > 1;
    var widths = sh.widths || [];
    var cols = "<cols>" + Array.from({ length: ncol }, function (_, i) { var w = widths[i]; if (!w) { w = 10; for (var r = 0; r < Math.min(rows.length, 300); r++) { var v = rows[r][i]; if (v != null) w = Math.max(w, Math.min(60, String(v).length + 2)); } } return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join("") + "</cols>";
    var fx = sh.freezeCols || 0, fy = head ? 1 : 0, view;
    if (fx || fy) { var tl = colName(fx) + (fy + 1); view = '<sheetViews><sheetView workbookViewId="0"><pane' + (fx ? ' xSplit="' + fx + '"' : "") + (fy ? ' ySplit="' + fy + '"' : "") + ' topLeftCell="' + tl + '" activePane="' + (fx && fy ? "bottomRight" : fy ? "bottomLeft" : "topRight") + '" state="frozen"/></sheetView></sheetViews>'; }
    else view = '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    var body = rows.map(function (r, ri) {
      var bold = (head && ri === 0) || (sh.boldRows && sh.boldRows.indexOf(ri) > -1);
      return '<row r="' + (ri + 1) + '">' + r.map(function (v, ci) {
        if (v == null || v === "") return "";
        var ref = colName(ci) + (ri + 1);
        if (typeof v === "number" && isFinite(v)) return '<c r="' + ref + '"' + (bold ? ' s="1"' : "") + "><v>" + v + "</v></c>";
        var t = String(v); if (t.length > 32000) t = t.slice(0, 32000) + "…";
        return '<c r="' + ref + '" t="inlineStr"' + (bold ? ' s="1"' : "") + '><is><t xml:space="preserve">' + xml(t) + "</t></is></c>";
      }).join("") + "</row>";
    }).join("");
    var af = head ? '<autoFilter ref="A1:' + colName(ncol - 1) + rows.length + '"/>' : "";
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      view + '<sheetFormatPr defaultRowHeight="15"/>' + cols + "<sheetData>" + body + "</sheetData>" + af + "</worksheet>";
  }
  /* sheets: [{ name, rows: [[...]], freezeCols, widths, header }] → Blob */
  function xlsx(sheets, meta) {
    var used = {}, names = sheets.map(function (s) { return sheetName(s.name, used); });
    var f = function (name, s) { return { name: name, data: enc.encode(s) }; };
    var files = [
      f("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        names.map(function (_, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join("") + "</Types>"),
      f("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'),
      f("docProps/core.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + xml((meta && meta.title) || "FODO Competitor Sheet") + "</dc:title><dc:creator>FODO Competitor Finder</dc:creator><dcterms:created xsi:type=\"dcterms:W3CDTF\">" + new Date().toISOString().replace(/\.\d+Z$/, "Z") + "</dcterms:created></cp:coreProperties>"),
      f("xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>' +
        names.map(function (n, i) { return '<sheet name="' + xml(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join("") + "</sheets>" +
        (function () { var dn = names.map(function (n, i) { var s = sheets[i]; return s.header !== false && s.rows.length > 1 ? '<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">\'' + xml(n.replace(/'/g, "''")) + "'!$A$1:$" + colName(s.rows.reduce(function (m, r) { return Math.max(m, r.length); }, 1) - 1) + "$" + s.rows.length + "</definedName>" : ""; }).join(""); return dn ? "<definedNames>" + dn + "</definedNames>" : ""; })() + "</workbook>"),
      f("xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        names.map(function (_, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join("") +
        '<Relationship Id="rId' + (names.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
      f("xl/styles.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDE9FE"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'),
    ];
    sheets.forEach(function (s, i) { files.push(f("xl/worksheets/sheet" + (i + 1) + ".xml", sheetXML(s))); });
    return zip(files);
  }


  /* ---------- PDF (text, not a screenshot): A4, Helvetica, real headings/lists/tables, page numbers ----------
     blocks: { h1 } { h2 } { h3 } { p, muted?, bold? } { li: [..] } { kv: [[k, v], ..] } { rule: true } { gap: n } { pill: text, color: [r,g,b] } */
  var HW = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  var WIN = { "€": 128, "‚": 130, "…": 133, "‘": 145, "’": 146, "“": 147, "”": 148, "•": 149, "–": 150, "—": 151, "™": 153, " ": 32 };
  function winAnsi(s) {   // → array of byte codes; characters outside WinAnsi are spelled out or become "?"
    s = String(s == null ? "" : s).replace(/₹/g, "Rs.").replace(/[★☆]/g, "*").replace(/[→➜]/g, "->").replace(/[✓✔]/g, "v").replace(/[✕✖×]/g, "x").replace(/[≤]/g, "<=").replace(/[≥]/g, ">=").replace(/[​-‏﻿]/g, "");
    var out = []; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i), ch = s.charAt(i); if (c === 9 || c === 10 || c === 13) out.push(32); else if (c >= 32 && c < 127) out.push(c); else if (WIN[ch]) out.push(WIN[ch]); else if (c >= 160 && c <= 255) out.push(c); else if (c >= 0xd800 && c < 0xdc00) { if (out[out.length - 1] !== 63) out.push(63); i++; } else if (out[out.length - 1] !== 63) out.push(63); }
    return out;
  }
  var cw = function (b, bold) { var w = b >= 32 && b < 127 ? HW[b - 32] : b === 150 ? 556 : b === 151 ? 1000 : b === 149 ? 350 : b === 133 ? 1000 : b >= 145 && b <= 148 ? 333 : 556; return bold ? w * 1.06 : w; };
  function pdf(blocks, meta) {
    meta = meta || {};
    var W = 595.28, H = 841.89, M = 48, y = 0, pages = [], cur = null, accent = meta.accent || [0.30, 0.23, 0.81];
    var newPage = function () { cur = []; pages.push(cur); y = H - M; };
    var esc8 = function (bytes) { return bytes.map(function (b) { return b === 40 || b === 41 || b === 92 ? "\\" + String.fromCharCode(b) : b < 32 || b > 126 ? "\\" + ("00" + b.toString(8)).slice(-3) : String.fromCharCode(b); }).join(""); };
    var width = function (bytes, size, bold) { var w = 0; bytes.forEach(function (b) { w += cw(b, bold); }); return w * size / 1000; };
    var wrap = function (text, size, bold, maxW) {
      var words = winAnsi(text), lines = [], line = [], lw = 0, word = [], ww = 0, sp = cw(32, bold) * size / 1000;
      var flushWord = function () { if (!word.length) return; if (line.length && lw + sp + ww > maxW) { lines.push(line); line = []; lw = 0; } if (ww > maxW) { /* very long word: hard-break */ var part = []; var pw = 0; word.forEach(function (b) { var bw = cw(b, bold) * size / 1000; if (pw + bw > maxW) { lines.push(part); part = []; pw = 0; } part.push(b); pw += bw; }); line = part; lw = pw; } else { if (line.length) { line.push(32); lw += sp; } line = line.concat(word); lw += ww; } word = []; ww = 0; };
      words.forEach(function (b) { if (b === 32) flushWord(); else { word.push(b); ww += cw(b, bold) * size / 1000; } });
      flushWord(); if (line.length) lines.push(line); return lines.length ? lines : [[]];
    };
    var text = function (x, bytes, size, bold, rgb) { cur.push((rgb ? rgb.map(function (v) { return v.toFixed(3); }).join(" ") + " rg " : "0.11 0.11 0.14 rg ") + "BT /" + (bold ? "F2" : "F1") + " " + size + " Tf " + x.toFixed(2) + " " + y.toFixed(2) + " Td (" + esc8(bytes) + ") Tj ET"); };
    var need = function (h) { if (y - h < M) newPage(); };
    var para = function (t, size, bold, rgb, indent, lead) { var maxW = W - 2 * M - (indent || 0), lines = wrap(t, size, bold, maxW), lh = size * (lead || 1.38); lines.forEach(function (l) { need(lh); y -= lh; text(M + (indent || 0), l, size, bold, rgb); }); };
    newPage();
    blocks.forEach(function (b) {
      if (b.h1) { need(40); para(b.h1, 20, true, accent, 0, 1.2); y -= 6; }
      else if (b.h2) { need(46); y -= 10; para(b.h2, 14, true, accent); cur.push(accent.map(function (v) { return v.toFixed(3); }).join(" ") + " RG 0.6 w " + M + " " + (y - 5).toFixed(2) + " m " + (W - M) + " " + (y - 5).toFixed(2) + " l S"); y -= 8; }
      else if (b.h3) { need(30); y -= 4; para(b.h3, 11.5, true); }
      else if (b.p != null) { para(b.p, b.size || 10, !!b.bold, b.muted ? [0.42, 0.43, 0.48] : null); y -= 3; }
      else if (b.li) { b.li.forEach(function (it) { var lines = wrap(it, 10, false, W - 2 * M - 14); lines.forEach(function (l, i) { need(14); y -= 14; if (!i) text(M + 2, [149], 10, false, accent); text(M + 14, l, 10, false); }); y -= 2; }); y -= 3; }
      else if (b.kv) { b.kv.forEach(function (row) { var k = winAnsi(row[0]), kw = 150, lines = wrap(row[1], 10, false, W - 2 * M - kw); lines.forEach(function (l, i) { need(14); y -= 14; if (!i) text(M, k, 9.5, true, [0.35, 0.36, 0.42]); text(M + kw, l, 10, false); }); y -= 2; }); y -= 2; }
      else if (b.pill) { need(22); y -= 18; var t = winAnsi(b.pill), tw = width(t, 9, true); var c = b.color || accent; cur.push(c.map(function (v) { return v.toFixed(3); }).join(" ") + " rg " + M + " " + (y - 4).toFixed(2) + " " + (tw + 12).toFixed(2) + " 15 re f"); text(M + 6, t, 9, true, [1, 1, 1]); y -= 4; }
      else if (b.rule) { need(12); y -= 6; cur.push("0.85 0.86 0.9 RG 0.5 w " + M + " " + y.toFixed(2) + " m " + (W - M) + " " + y.toFixed(2) + " l S"); y -= 6; }
      else if (b.gap) { y -= b.gap; }
    });
    // v13 white-label logo (JPEG bytes): top-right of every page
    var logo = null;
    if (meta.logo && meta.logo.length > 4 && meta.logo[0] === 0xff && meta.logo[1] === 0xd8) {
      var L = meta.logo, i = 2, lw = 0, lh = 0, comps = 3;
      while (i < L.length - 9) { if (L[i] !== 0xff) { i++; continue; } var mk = L[i + 1], len = (L[i + 2] << 8) | L[i + 3]; if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) { lh = (L[i + 5] << 8) | L[i + 6]; lw = (L[i + 7] << 8) | L[i + 8]; comps = L[i + 9]; break; } i += 2 + len; }
      if (lw && lh && (comps === 1 || comps === 3)) { var dh = 26, dw = Math.min(150, lw * dh / lh); dh = dw * lh / lw; logo = { bytes: L, w: lw, h: lh, gray: comps === 1, dw: dw, dh: dh };
        pages.forEach(function (pg) { pg.unshift("q " + dw.toFixed(2) + " 0 0 " + dh.toFixed(2) + " " + (W - M - dw).toFixed(2) + " " + (H - 16 - dh).toFixed(2) + " cm /Im1 Do Q"); }); }
    }
    // footer + page numbers
    var foot = winAnsi(meta.footer || "");
    pages.forEach(function (pg, i) { var n = winAnsi("Page " + (i + 1) + " of " + pages.length); pg.push("0.5 0.5 0.55 rg BT /F1 8 Tf " + M + " 24 Td (" + esc8(foot) + ") Tj ET"); pg.push("0.5 0.5 0.55 rg BT /F1 8 Tf " + (W - M - width(n, 8, false)).toFixed(2) + " 24 Td (" + esc8(n) + ") Tj ET"); });
    // assemble objects
    var objs = [], add = function (o) { objs.push(o); return objs.length; };
    var catalog = add(""), pagesId = add(""), f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"), f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    var kids = [], im = logo ? add({ head: "<< /Type /XObject /Subtype /Image /Width " + logo.w + " /Height " + logo.h + " /ColorSpace /" + (logo.gray ? "DeviceGray" : "DeviceRGB") + " /BitsPerComponent 8 /Filter /DCTDecode /Length " + logo.bytes.length + " >>\nstream\n", bin: logo.bytes, tail: "\nendstream" }) : 0;
    pages.forEach(function (pg) { var content = pg.join("\n"), cId = add("<< /Length " + enc.encode(content).length + " >>\nstream\n" + content + "\nendstream"); kids.push(add("<< /Type /Page /Parent " + pagesId + " 0 R /MediaBox [0 0 " + W + " " + H + "] /Resources << /Font << /F1 " + f1 + " 0 R /F2 " + f2 + " 0 R >>" + (im ? " /XObject << /Im1 " + im + " 0 R >>" : "") + " >> /Contents " + cId + " 0 R >>")); });
    objs[catalog - 1] = "<< /Type /Catalog /Pages " + pagesId + " 0 R >>";
    objs[pagesId - 1] = "<< /Type /Pages /Kids [" + kids.map(function (k) { return k + " 0 R"; }).join(" ") + "] /Count " + kids.length + " >>";
    var info = add("<< /Title (" + esc8(winAnsi(meta.title || "FODO report")) + ") /Producer (" + (meta.whiteLabel ? "PDF" : "FODO") + ") /Creator (" + esc8(winAnsi(meta.whiteLabel ? "Website X-Ray" : "FODO Business X-Ray")) + ") >>");
    var head = "%PDF-1.4\n%âãÏÓ\n", parts = [head], offs = [], pos = enc.encode(head).length;
    // the binary comment line must be real bytes: write it as latin-1
    parts[0] = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 226, 227, 207, 211, 10]); pos = parts[0].length;
    objs.forEach(function (o, i) {
      offs.push(pos);
      if (typeof o === "object") { var hb = enc.encode((i + 1) + " 0 obj\n" + o.head), tb = enc.encode(o.tail + "\nendobj\n"); parts.push(hb, o.bin, tb); pos += hb.length + o.bin.length + tb.length; return; }
      var b = enc.encode((i + 1) + " 0 obj\n" + o + "\nendobj\n"); parts.push(b); pos += b.length; });
    var xref = "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n" + offs.map(function (o) { return ("000000000" + o).slice(-10) + " 00000 n \n"; }).join("") + "trailer\n<< /Size " + (objs.length + 1) + " /Root " + catalog + " 0 R /Info " + info + " 0 R >>\nstartxref\n" + pos + "\n%%EOF";
    parts.push(enc.encode(xref));
    return new Blob(parts, { type: "application/pdf" });
  }

  /* ---------- CSV / TSV ---------- */
  var csvCell = function (v) { v = v == null ? "" : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  function csv(rows) { return new Blob(["﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n")], { type: "text/csv;charset=utf-8" }); }
  function tsv(rows) { return rows.map(function (r) { return r.map(function (v) { return String(v == null ? "" : v).replace(/[\t\r\n]+/g, " "); }).join("\t"); }).join("\n"); }

  /* ---------- where are we? ---------- */
  var UA = navigator.userAgent || "";
  var inApp = function () { return /FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Line\/|Snapchat|Twitter|TikTok|musical_ly|Pinterest|; wv\)|GSA\/|MicroMessenger/i.test(UA); };
  var isPhone = function () { return /Android|iPhone|iPad|iPod|Mobile/i.test(UA) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(UA)) || (window.matchMedia && matchMedia("(pointer:coarse) and (max-width:900px)").matches); };
  var isIOS = function () { return /iPhone|iPad|iPod/i.test(UA) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(UA)); };

  function anchorDownload(blob, name) {
    var u = URL.createObjectURL(blob), a = document.createElement("a"); a.href = u; a.download = name; a.rel = "noopener"; a.style.display = "none";
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 60000);
  }
  function serverDownload(blob, name) {   // a real web download (Content-Disposition: attachment) — works in every phone browser
    var type = blob.type.split(";")[0];
    return fetch(ROOT + "api/export", { method: "POST", headers: { "content-type": type, "x-file-name": name }, body: blob }).then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (j) { if (!j.ok || !j.url) throw new Error(j.reason || "upload failed"); location.href = (j.url.charAt(0) === "/" ? j.url : ROOT + j.url); return j; });
  }
  function canShareFile(file) { try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] })); } catch (e) { return false; } }

  /* ---------- the phone dialog ---------- */
  var dlg = null, lastFocus = null;
  function closeDlg() { if (!dlg) return; dlg.hidden = true; document.documentElement.classList.remove("cfx-open"); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  function openDlg(title, html) {
    if (!dlg) {
      dlg = document.createElement("div"); dlg.className = "cfx"; dlg.hidden = true;
      dlg.innerHTML = '<div class="cfx-back" data-x></div><div class="cfx-box" role="dialog" aria-modal="true" aria-labelledby="cfx-t"><button type="button" class="cfx-close" data-x aria-label="Close">×</button><h3 id="cfx-t"></h3><div class="cfx-body"></div></div>';
      document.body.appendChild(dlg);
      dlg.addEventListener("click", function (e) { if (e.target.closest("[data-x]")) closeDlg(); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && dlg && !dlg.hidden) closeDlg(); });
      dlg.addEventListener("keydown", function (e) {
        if (e.key === "Tab") { var f = [].slice.call(dlg.querySelectorAll("button,a[href],textarea")).filter(function (x) { return !x.disabled && x.offsetParent; }); if (!f.length) return; var i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
      });
    }
    lastFocus = document.activeElement;
    var old = dlg.querySelector(".cfx-body"), nb = document.createElement("div"); nb.className = "cfx-body"; nb.innerHTML = html; old.parentNode.replaceChild(nb, old);   // fresh node: no listeners left over from the last file
    dlg.querySelector("#cfx-t").textContent = title; dlg.hidden = false;
    document.documentElement.classList.add("cfx-open");
    setTimeout(function () { var b = dlg.querySelector(".cfx-body button,.cfx-body textarea"); (b || dlg.querySelector(".cfx-close")).focus(); }, 30);
    return dlg.querySelector(".cfx-body");
  }
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var track = function (n, p) { try { if (window.FODO_TRACK) window.FODO_TRACK(n, p || {}); } catch (e) {} };
  function whereHint() {
    return isIOS() ? "On iPhone the file goes to the <b>Files</b> app → <b>Downloads</b> (or wherever you chose in “Save to Files”)." : "On Android the file goes to the <b>Files</b> / <b>My Files</b> app → <b>Downloads</b>. You can also open it from the browser’s menu → Downloads.";
  }

  /* deliver(blob, name, { kind: "Excel"|"CSV" }) → Promise<"download"|"share"|"server"|"dialog"> */
  function deliver(blob, name, opts) {
    opts = opts || {};
    var phone = isPhone(), app = inApp();
    if (!phone && !app) { anchorDownload(blob, name); track("cf_export", { how: "download", kind: opts.kind }); return Promise.resolve("download"); }
    var file = null; try { file = new File([blob], name, { type: blob.type.split(";")[0] }); } catch (e) {}
    var share = file && canShareFile(file);
    var body = openDlg("Save your " + (opts.kind || "file"),
      (app ? '<p class="cfx-warn"><b>You are inside an app’s browser</b> (Instagram, Facebook, LinkedIn …). These often block downloads. If nothing is saved, tap <b>⋯</b> / <b>⋮</b> and choose <b>“Open in browser”</b>, then download again.</p>' : "") +
      '<p class="cfx-file"><b>' + esc(name) + "</b> · " + (blob.size > 1e6 ? (blob.size / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(blob.size / 1024)) + " KB") + "</p>" +
      '<div class="cfx-acts">' + (share ? '<button type="button" class="btn" data-a="share">Save or share file</button>' : "") +
      '<button type="button" class="btn' + (share ? " ghost" : "") + '" data-a="server">Download</button>' +
      '<button type="button" class="btn ghost" data-a="here">Try direct download</button></div>' +
      '<p class="cfx-note" aria-live="polite"></p><p class="cfx-hint">' + whereHint() + "</p>");
    var note = body.querySelector(".cfx-note");
    return new Promise(function (resolve) {
      body.addEventListener("click", function (e) {
        var b = e.target.closest("[data-a]"); if (!b) return; var a = b.dataset.a;
        if (a === "share") {
          navigator.share({ files: [file], title: name }).then(function () { note.textContent = "Done ✓"; track("cf_export", { how: "share", kind: opts.kind }); setTimeout(closeDlg, 900); resolve("share"); },
            function (err) { if (err && err.name === "AbortError") return; note.textContent = "Sharing did not work here — use Download."; });
        } else if (a === "server") {
          b.disabled = true; note.textContent = "Preparing your download…";
          serverDownload(blob, name).then(function () { note.innerHTML = "Download started ✓ — " + whereHint(); track("cf_export", { how: "server", kind: opts.kind }); b.disabled = false; resolve("server"); },
            function () { b.disabled = false; anchorDownload(blob, name); note.textContent = "Tried a direct download instead. If nothing appears, use “Copy for Google Sheets”."; track("cf_export", { how: "fallback", kind: opts.kind }); resolve("download"); });
        } else { anchorDownload(blob, name); note.innerHTML = "Started. " + whereHint(); track("cf_export", { how: "download", kind: opts.kind }); resolve("download"); }
      });
    });
  }

  /* copy text, or show it in a box to copy by hand when the clipboard is blocked */
  function copyText(t, title) {
    var ok = function () { track("cf_export", { how: "clipboard", kind: "Sheets" }); return "copied"; };
    var manual = function () {
      var body = openDlg(title || "Copy for Google Sheets", '<p>Your browser blocked automatic copying. The rows are selected below — press <b>Copy</b>, then paste into cell A1 of a new Google Sheet.</p><textarea class="cfx-ta" readonly rows="8"></textarea><div class="cfx-acts"><button type="button" class="btn" data-a="copy">Copy</button></div><p class="cfx-note" aria-live="polite"></p>');
      var ta = body.querySelector("textarea"); ta.value = t; setTimeout(function () { ta.focus(); ta.select(); }, 60);
      body.querySelector("[data-a=copy]").addEventListener("click", function () { ta.focus(); ta.select(); try { ta.setSelectionRange(0, t.length); } catch (e) {} var r = false; try { r = document.execCommand("copy"); } catch (e) {} body.querySelector(".cfx-note").textContent = r ? "Copied ✓ — paste into Google Sheets." : "Long-press the text → Select all → Copy."; });
      return "manual";
    };
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext !== false) return navigator.clipboard.writeText(t).then(ok, manual);
    return Promise.resolve(manual());
  }

  /* ---------- storage: IndexedDB, falling back to localStorage ---------- */
  var DB = null;
  function db() {
    if (DB) return DB;
    return DB = new Promise(function (res, rej) {
      try { var r = indexedDB.open("fodo-finder", 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; r.onblocked = function () { rej(new Error("blocked")); }; }
      catch (e) { rej(e); }
    });
  }
  var store = {
    get: function (k) { return db().then(function (d) { return new Promise(function (res, rej) { var q = d.transaction("kv", "readonly").objectStore("kv").get(k); q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); }; }); }).catch(function () { try { return JSON.parse(localStorage.getItem("fodo-" + k) || "null"); } catch (e) { return null; } }); },
    set: function (k, v) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = function () { res(true); }; t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error); }; }); }).catch(function () { try { localStorage.setItem("fodo-" + k, JSON.stringify(v)); return true; } catch (e) { return false; } }); },
  };

  window.FODO_EXPORT = { xlsx: xlsx, pdf: pdf, csv: csv, tsv: tsv, deliver: deliver, copyText: copyText, store: store, isPhone: isPhone, inApp: inApp, anchorDownload: anchorDownload, close: closeDlg, crc32: crc32 };
})();
