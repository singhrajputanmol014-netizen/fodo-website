/* FODO Website Builder v35, media library. Upload (button or drag & drop, several at once), search, folders, rename,
   alt text, focal point, crop (1:1 · 4:3 · 16:9 · 3:4 · original), resize, delete (warns where the image is used) and
   "Replace everywhere". Images are resized and converted to WebP in the browser before upload (no paid image service);
   identical files are stored once on the server. Inserted images carry their size + focal point (#w=…&h=…&fp=…), so the
   published page reserves the space (no layout shift) and crops around the important part. */
import { modal } from "/js/wb-panels.js";
import { esc } from "/sites/lib/render.js";

let X = null; export function bind(ctx) { X = ctx; }
const $ = (s, el) => (el || document).querySelector(s), $$ = (s, el) => [...(el || document).querySelectorAll(s)];
const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
const base = (u) => String(u || "").split("#")[0];
export const withMeta = (m) => m.url + "#" + ["w=" + (m.width || ""), "h=" + (m.height || ""), m.focal ? "fp=" + m.focal : ""].filter((x) => !/=$/.test(x)).join("&");
const uses = (id) => { const ED = X.ED(), L = []; (ED.doc.pages || []).forEach((p) => { if (JSON.stringify(p).indexOf("/api/sites/media/" + id) > -1) L.push(p.title); }); if (JSON.stringify(ED.doc.settings || {}).indexOf("/api/sites/media/" + id) > -1) L.push("Settings"); return L; };

/* image → (crop) → max size → WebP blob (JPEG if the browser can't write WebP) */
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => rej(new Error("This image couldn't be read.")); i.src = src; }); }
export async function encode(src, o) {
  o = o || {}; const im = await loadImg(src); let sx = 0, sy = 0, sw = im.naturalWidth, sh = im.naturalHeight;
  if (o.ratio) { const r = o.ratio, fx = (o.fx == null ? 50 : o.fx) / 100, fy = (o.fy == null ? 50 : o.fy) / 100;
    if (sw / sh > r) { const w = Math.round(sh * r); sx = Math.round(Math.min(sw - w, Math.max(0, fx * sw - w / 2))); sw = w; } else { const h = Math.round(sw / r); sy = Math.round(Math.min(sh - h, Math.max(0, fy * sh - h / 2))); sh = h; } }
  const k = Math.min(1, (o.max || 2000) / Math.max(sw, sh)), c = document.createElement("canvas"); c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
  c.getContext("2d").drawImage(im, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, "image/webp", o.q || 0.82)), out = blob && blob.type === "image/webp" ? blob : await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
  return { blob: out, w: c.width, h: c.height };
}
async function send(file, meta) {
  const url = URL.createObjectURL(file); try { const e = await encode(url, { max: meta.max || 2000 });
    if (e.blob.size > 2.4e6) throw new Error(file.name + " is still too big after compression.");
    const q = ["name=" + encodeURIComponent(meta.name || file.name || "image"), "w=" + e.w, "h=" + e.h].concat(meta.folder ? ["folder=" + encodeURIComponent(meta.folder)] : []).concat(meta.alt ? ["alt=" + encodeURIComponent(meta.alt)] : []).join("&");
    const r = await X.api(X.ED().id + "/media?" + q, "POST", null, { type: e.blob.type, data: e.blob }); if (!r.ok) throw new Error(r.reason || "Upload failed.");
    return Object.assign(r, { before: file.size, after: e.blob.size, w: e.w, h: e.h }); } finally { URL.revokeObjectURL(url); }
}

/* ---------- the library ---------- */
export function library(opt) {
  opt = opt || {}; const pick = typeof opt.onPick === "function"; let items = [], folder = "", q = "", sel = null;
  const m = modal('<div class="wb-ml"><div class="wb-mlh"><h2>Media library</h2><input class="wb-in" id="ml-q" type="search" placeholder="Search name or alt text" aria-label="Search images"><button class="wb-btn pri sm" id="ml-up">⇪ Upload</button></div>' +
    '<div class="wb-mlf" id="ml-f"></div><div class="wb-mlb"><div class="wb-mlg" id="ml-g" tabindex="0" aria-label="Images (drop files here)"><div class="wb-spin"></div></div><aside class="wb-mld" id="ml-d"><p class="wb-muted">Select an image to edit its alt text, focal point, crop or size.</p></aside></div>' +
    '<p class="wb-muted wb-mlfoot" id="ml-s">Drop images anywhere here. They are resized and converted to WebP before upload.</p></div>', "wb-wide wb-mlm");
  const G = $("#ml-g", m), D = $("#ml-d", m), status = (t, bad) => { const s = $("#ml-s", m); s.textContent = t; s.classList.toggle("warn", !!bad); };
  const load = async () => { const r = await X.api(X.ED().id + "/media"); if (!r.ok) { G.innerHTML = '<p class="wb-muted">' + esc(r.reason || "Couldn't load your images.") + "</p>"; return; } items = r.items || []; draw(); };
  const draw = () => {
    const folders = [...new Set(items.map((x) => x.folder).filter(Boolean))].sort();
    $("#ml-f", m).innerHTML = ['<button data-fo="" aria-pressed="' + !folder + '">All (' + items.length + ")</button>"].concat(folders.map((f) => '<button data-fo="' + esc(f) + '" aria-pressed="' + (f === folder) + '">' + esc(f) + "</button>")).join("");
    $$("[data-fo]", m).forEach((b) => { b.onclick = () => { folder = b.dataset.fo; draw(); }; });
    const L = items.filter((x) => (!folder || x.folder === folder) && (!q || (String(x.name) + " " + String(x.alt)).toLowerCase().indexOf(q) > -1));
    G.innerHTML = L.length ? L.map((x) => '<button class="wb-mlc' + (sel && sel.id === x.id ? " on" : "") + '" data-id="' + x.id + '" title="' + esc(x.name || "") + '"><img src="' + esc(x.url) + '" alt="' + esc(x.alt || "") + '" loading="lazy"' + (x.focal ? ' style="object-position:' + x.focal.replace(",", "% ") + '%"' : "") + "><span>" + esc(x.name || "image") + "</span>" + (x.alt ? "" : '<i title="No alt text">alt?</i>') + "</button>").join("")
      : '<div class="wb-mlempty"><p>' + (items.length ? "No image matches." : "No images yet.") + '</p><button class="wb-btn pri" id="ml-up2">Upload images</button><p class="wb-muted">or drop them here</p></div>';
    if ($("#ml-up2", m)) $("#ml-up2", m).onclick = pickFiles;
    $$(".wb-mlc", m).forEach((b) => { b.onclick = () => { sel = items.find((x) => x.id === b.dataset.id); draw(); detail(); }; b.ondblclick = () => { if (pick) choose(); }; });
  };
  const choose = () => { if (!sel) return; m.remove(); opt.onPick(withMeta(sel), sel); };
  const save = async (b) => { const r = await X.api(X.ED().id + "/media/" + sel.id, "POST", b); if (!r.ok) return status(r.reason || "Not saved.", true); Object.assign(sel, b); status("Saved ✓"); draw(); };
  const detail = () => {
    if (!sel) { D.innerHTML = ""; return; } const u = uses(sel.id), fp = (sel.focal || "50,50").split(",");
    D.innerHTML = '<div class="wb-mlfp" id="ml-fp" title="Click the most important point (stays visible when the image is cropped)"><img src="' + esc(sel.url) + '" alt=""><i style="left:' + fp[0] + "%;top:" + fp[1] + '%"></i></div>' +
      '<p class="wb-muted">' + (sel.width ? sel.width + " × " + sel.height + " · " : "") + kb(sel.size) + " · " + esc(sel.mime.replace("image/", "").toUpperCase()) + (u.length ? " · used on " + esc(u.join(", ")) : " · not used yet") + "</p>" +
      '<label class="wb-lab">Name<input class="wb-in" id="ml-n" value="' + esc(sel.name || "") + '"></label>' +
      '<label class="wb-lab">Alt text <small>(what the image shows, for blind visitors and Google)</small><input class="wb-in" id="ml-a" value="' + esc(sel.alt || "") + '" placeholder="e.g. Dentist explaining a treatment to a patient"></label>' +
      '<label class="wb-lab">Folder<input class="wb-in" id="ml-fo" list="ml-fl" value="' + esc(sel.folder || "") + '" placeholder="e.g. Team"><datalist id="ml-fl">' + [...new Set(items.map((x) => x.folder).filter(Boolean))].map((f) => '<option value="' + esc(f) + '">').join("") + "</datalist></label>" +
      '<div class="wb-row"><select class="wb-in" id="ml-cr" aria-label="Crop"><option value="">Crop…</option><option value="1">Square 1:1</option><option value="1.3333">Landscape 4:3</option><option value="1.7778">Wide 16:9</option><option value="0.75">Portrait 3:4</option></select>' +
      '<select class="wb-in" id="ml-rs" aria-label="Resize"><option value="">Resize…</option><option value="1600">Large (1600px)</option><option value="1200">Medium (1200px)</option><option value="800">Small (800px)</option><option value="400">Thumbnail (400px)</option></select></div>' +
      '<div class="wb-row"><button class="wb-btn sm" id="ml-rep">Replace everywhere…</button><button class="wb-btn sm danger" id="ml-del">Delete</button>' + (pick ? '<button class="wb-btn pri sm" id="ml-use">Use this image</button>' : "") + "</div>";
    $("#ml-n", D).onchange = function () { save({ name: this.value.trim() }); }; $("#ml-a", D).onchange = function () { save({ alt: this.value.trim() }); }; $("#ml-fo", D).onchange = function () { save({ folder: this.value.trim() }); };
    $("#ml-fp", D).onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(), x = Math.round(Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100))), y = Math.round(Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100))); save({ focal: x + "," + y }).then(detail); };
    const derive = async (o, label) => { status(label + "…"); try { const e = await encode(sel.url, Object.assign({ fx: +fp[0], fy: +fp[1] }, o)), q2 = "name=" + encodeURIComponent((sel.name || "image") + " (" + label.toLowerCase() + ")") + "&w=" + e.w + "&h=" + e.h + (sel.folder ? "&folder=" + encodeURIComponent(sel.folder) : "") + (sel.alt ? "&alt=" + encodeURIComponent(sel.alt) : "");
      const r = await X.api(X.ED().id + "/media?" + q2, "POST", null, { type: e.blob.type, data: e.blob }); if (!r.ok) throw new Error(r.reason); status(label + " saved as a new image (" + e.w + " × " + e.h + ", " + kb(e.blob.size) + "). The original is kept."); await load(); sel = items.find((x) => x.id === r.id) || sel; draw(); detail(); } catch (err) { status(err.message || "That didn't work.", true); } };
    $("#ml-cr", D).onchange = function () { if (this.value) derive({ ratio: +this.value, max: 2000 }, "Cropped"); };
    $("#ml-rs", D).onchange = function () { if (this.value) derive({ max: +this.value }, "Resized"); };
    $("#ml-rep", D).onclick = () => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.onchange = async () => { const f = inp.files[0]; if (!f) return; status("Uploading the replacement…");
      try { const r = await send(f, { folder: sel.folder, alt: sel.alt }), old = "/api/sites/media/" + sel.id, nu = r.url;
        const fresh = { id: r.id, url: nu, width: r.w, height: r.h, focal: sel.focal };
        X.change(() => { const s0 = JSON.stringify(X.ED().doc).split(new RegExp(old.replace(/[/]/g, "\\/") + "(#[a-z0-9=&,.]*)?", "g")).join(withMeta(fresh)); Object.assign(X.ED().doc, JSON.parse(s0)); });
        status("Replaced on " + (uses(r.id).join(", ") || "no page") + ". Undo (Ctrl+Z) puts the old image back."); await load(); sel = items.find((x) => x.id === r.id) || null; draw(); detail(); } catch (err) { status(err.message, true); } }; inp.click(); };
    $("#ml-del", D).onclick = async () => { const u2 = uses(sel.id); if (!confirm(u2.length ? "This image is used on " + u2.join(", ") + ". Delete it anyway? Those places will show an empty image box." : "Delete this image?")) return;
      const r = await X.api(X.ED().id + "/media/" + sel.id + "?force=1", "DELETE"); if (!r.ok) return status(r.reason || "Not deleted.", true); items = items.filter((x) => x.id !== sel.id); sel = null; status("Deleted."); draw(); detail(); };
    if ($("#ml-use", D)) $("#ml-use", D).onclick = choose;
  };
  const upFiles = async (files) => { files = [...files].filter((f) => /^image\//.test(f.type) && !/svg/.test(f.type)).slice(0, 20); if (!files.length) return status("Choose PNG, JPG, WebP or GIF images.", true);
    let saved = 0, before = 0, after = 0, dup = 0, last = null; for (let i = 0; i < files.length; i++) { status("Uploading " + (i + 1) + " of " + files.length + "…");
      try { const r = await send(files[i], { folder }); before += r.before; after += r.after; if (r.duplicate) dup++; else saved++; last = r.id; } catch (err) { status(err.message, true); } }
    status(saved + " uploaded" + (dup ? ", " + dup + " already in the library" : "") + (before ? " · " + kb(before) + " → " + kb(after) + " after compression" : "")); await load(); if (last) { sel = items.find((x) => x.id === last); draw(); detail(); } };
  const pickFiles = () => { const inp = document.createElement("input"); inp.type = "file"; inp.multiple = true; inp.accept = "image/png,image/jpeg,image/webp,image/gif"; inp.onchange = () => upFiles(inp.files); inp.click(); };
  $("#ml-up", m).onclick = pickFiles; $("#ml-q", m).oninput = function () { q = this.value.trim().toLowerCase(); draw(); };
  const mc = $(".wb-ml", m); ["dragenter", "dragover"].forEach((ev) => mc.addEventListener(ev, (e) => { e.preventDefault(); mc.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => mc.addEventListener(ev, (e) => { e.preventDefault(); if (ev === "drop" || !mc.contains(e.relatedTarget)) mc.classList.remove("drag"); }));
  mc.addEventListener("drop", (e) => { if (e.dataTransfer && e.dataTransfer.files.length) upFiles(e.dataTransfer.files); });
  load(); return m;
}
