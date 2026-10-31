/* FODO Website Builder: Store & Blog manager (v29). Products (photos, options/variants, stock, collections), orders
   (status flow, payment check), discount codes, store settings (shipping, tax, payment methods), the merchant's own Cashfree
   connection (the secret goes to FODO's server once, encrypted there, never shown again), and blog posts (markdown, draft /
   scheduled / published). Everything goes through /api/sites/<id>/… which only resolves YOUR websites. */
import { md } from "/sites/lib/shop.js";
import { esc } from "/sites/lib/render.js";

const rs = (p) => "₹" + ((+p || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const rupees = (p) => (p ? String((+p || 0) / 100) : "");
const fmt = (s) => { try { return new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return s || ""; } };
const STATUS = { pending: "Awaiting payment", paid: "Paid", cod: "Cash on delivery", whatsapp: "WhatsApp, to confirm", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled", refunded: "Refunded" };
const FLOW = { pending: ["cancelled"], paid: ["shipped", "cancelled", "refunded"], cod: ["shipped", "cancelled", "paid"], whatsapp: ["cod", "paid", "cancelled"], shipped: ["delivered", "cancelled"], delivered: ["refunded"], cancelled: [], refunded: [] };
const ACT = { shipped: "Mark shipped", delivered: "Mark delivered", cancelled: "Cancel", refunded: "Mark refunded", paid: "Mark paid", cod: "Confirm (COD)" };

/* X = { id, api, toast, upload, doc(), change(fn, noPaint), refresh() } */
export function openStore(X, tab) {
  const box = document.createElement("div"); box.className = "wb-modal wb-store"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Store and blog");
  const TABS = [["products", "Products"], ["orders", "Orders"], ["discounts", "Discounts"], ["blog", "Blog"], ["settings", "Store settings"]];
  box.innerHTML = '<div class="wb-mc wb-big"><div class="wb-sthead"><h2>Store &amp; Blog</h2><nav class="wb-tabs">' + TABS.map((t) => '<button data-st="' + t[0] + '">' + t[1] + "</button>").join("") + '</nav><button class="wb-ib" data-close title="Close">✕</button></div><div id="wb-stb" class="wb-stb"></div></div>';
  document.body.appendChild(box);
  const $ = (s) => box.querySelector(s), $$ = (s) => [...box.querySelectorAll(s)], body = () => $("#wb-stb");
  const close = () => { box.remove(); document.removeEventListener("keydown", esck); X.refresh && X.refresh(); };
  const esck = (e) => { if (e.key === "Escape") close(); }; document.addEventListener("keydown", esck);
  $("[data-close]").onclick = close;
  const go = (t) => { $$("[data-st]").forEach((b) => b.setAttribute("aria-selected", b.dataset.st === t)); body().innerHTML = '<p class="wb-muted">Loading…</p>'; ({ products, orders, discounts, blog, settings })[t](); };
  $$("[data-st]").forEach((b) => { b.onclick = () => go(b.dataset.st); });
  const fail = (r) => { X.toast(r.reason || "Something went wrong.", true); };

  /* ---------- products ---------- */
  async function products() {
    const r = await X.api(X.id + "/products"); if (!r.ok) return fail(r);
    body().innerHTML = '<div class="wb-row" style="margin-top:0"><button class="wb-btn pri sm" id="np">+ Add product</button><span class="wb-muted">' + r.products.length + " product(s)</span></div>" +
      (r.products.length ? '<table class="wb-tbl"><thead><tr><th></th><th>Product</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody>' + r.products.map((p) => "<tr><td>" + (p.images[0] ? '<img src="' + esc(p.images[0]) + '" alt="">' : "") + "</td><td><b>" + esc(p.title) + "</b><br><small>" + esc(p.collection || "") + (p.variants.length ? " · " + p.variants.length + " options" : "") + "</small></td><td>" + rs(p.variants.length ? Math.min.apply(null, p.variants.map((v) => v.price)) : p.price) + "</td><td>" + (p.track ? (p.variants.length ? p.variants.reduce((a, v) => a + v.stock, 0) : p.stock) : "∞") + "</td><td>" + (p.status === "active" ? "Active" : "Draft") + '</td><td><button class="wb-btn sm" data-ep="' + p.id + '">Edit</button></td></tr>').join("") + "</tbody></table>"
        : '<p class="wb-empty">No products yet. Add your first product, then put a <b>Products</b> section on any page (or use “Add a Shop page” in Store settings).</p>');
    $("#np").onclick = () => productForm(null);
    $$("[data-ep]").forEach((b) => { b.onclick = () => productForm(r.products.find((p) => p.id === b.dataset.ep)); });
  }
  function productForm(p) {
    const P = p || { title: "", price: 0, compare: 0, description: "", images: [], optionName: "Size", variants: [], track: false, stock: 0, collection: "", status: "active" };
    let imgs = P.images.slice(), vars = P.variants.map((v) => Object.assign({}, v));
    const draw = () => {
      body().innerHTML = '<form id="pf" class="wb-pf"><button type="button" class="wb-btn sm" id="back">← Products</button><h3>' + (p ? "Edit product" : "New product") + "</h3>" +
        '<label class="wb-lab">Name<input name="title" required maxlength="140" value="' + esc(P.title) + '"></label>' +
        '<div class="wb-g3"><label class="wb-lab">Price (₹)<input name="price" inputmode="decimal" value="' + rupees(P.price) + '" placeholder="499"></label><label class="wb-lab">Compare-at price (₹) <small>optional, shown struck out</small><input name="compare" inputmode="decimal" value="' + rupees(P.compare) + '"></label><label class="wb-lab">Collection <small>e.g. Shirts</small><input name="collection" maxlength="60" value="' + esc(P.collection || "") + '"></label></div>' +
        '<label class="wb-lab">Description <small>simple formatting: **bold**, *italic*, - lists, [link](https://…)</small><textarea name="description" rows="5">' + esc(P.description || "") + "</textarea></label>" +
        '<fieldset class="wb-list"><legend>Photos</legend><div class="wb-pimgs">' + imgs.map((u, i) => '<span><img src="' + esc(u) + '" alt=""><button type="button" class="wb-ib sm" data-xi="' + i + '" title="Remove">✕</button></span>').join("") + '</div><div class="wb-row"><button type="button" class="wb-btn sm" id="up">Upload photo</button><input id="iu" placeholder="…or paste an https:// image link" style="flex:1"><button type="button" class="wb-btn sm" id="iadd">Add</button></div></fieldset>' +
        '<label class="wb-ck"><input type="checkbox" name="track"' + (P.track ? " checked" : "") + "> Track stock (stop selling when it runs out)</label>" +
        '<label class="wb-lab" id="stk"' + (vars.length ? " hidden" : "") + '>Stock<input name="stock" type="number" min="0" value="' + (+P.stock || 0) + '"></label>' +
        '<fieldset class="wb-list"><legend>Options <small>(sizes, colours… each can have its own price and stock)</small></legend><label class="wb-lab">Option name<input name="optionName" maxlength="30" value="' + esc(P.optionName || "Size") + '"></label>' +
        vars.map((v, i) => '<div class="wb-g4"><input data-v="' + i + '" data-k="name" placeholder="e.g. M" value="' + esc(v.name) + '"><input data-v="' + i + '" data-k="price" inputmode="decimal" placeholder="Price ₹" value="' + rupees(v.price) + '"><input data-v="' + i + '" data-k="stock" type="number" min="0" placeholder="Stock" value="' + (+v.stock || 0) + '"><button type="button" class="wb-ib sm" data-xv="' + i + '">✕</button></div>').join("") +
        '<button type="button" class="wb-btn sm" id="addv">+ Add option</button></fieldset>' +
        '<label class="wb-lab">Status<select name="status"><option value="active">Active, visible in the store</option><option value="draft"' + (P.status === "draft" ? " selected" : "") + ">Draft, hidden</option></select></label>" +
        '<div class="wb-row"><button class="wb-btn pri">Save product</button>' + (p ? '<button type="button" class="wb-btn danger sm" id="del">Delete</button>' : "") + "</div></form>";
      const F = $("#pf"), keep = () => { const f = new FormData(F); ["title", "description", "collection", "optionName", "status"].forEach((k) => { P[k] = String(f.get(k) || ""); }); P.track = !!f.get("track"); P.stock = +f.get("stock") || 0; P.price = Math.round(parseFloat(f.get("price") || 0) * 100) || 0; P.compare = Math.round(parseFloat(f.get("compare") || 0) * 100) || 0;
        $$("[data-v]").forEach((i) => { const v = vars[+i.dataset.v]; v[i.dataset.k] = i.dataset.k === "name" ? i.value : i.dataset.k === "price" ? Math.round(parseFloat(i.value || 0) * 100) || 0 : +i.value || 0; }); };
      $("#back").onclick = products;
      $("#up").onclick = () => { keep(); X.upload((url) => { imgs.push(url); draw(); }); };
      $("#iadd").onclick = () => { const u = $("#iu").value.trim(); if (!/^https:\/\//.test(u)) return X.toast("Use an https:// image link.", true); keep(); imgs.push(u); draw(); };
      $$("[data-xi]").forEach((b) => { b.onclick = () => { keep(); imgs.splice(+b.dataset.xi, 1); draw(); }; });
      $("#addv").onclick = () => { keep(); vars.push({ name: "", price: P.price, stock: 0 }); draw(); };
      $$("[data-xv]").forEach((b) => { b.onclick = () => { keep(); vars.splice(+b.dataset.xv, 1); draw(); }; });
      if ($("#del")) $("#del").onclick = async () => { if (!confirm("Delete " + P.title + "?")) return; const r = await X.api(X.id + "/products/" + p.id, "DELETE"); if (!r.ok) return fail(r); X.toast("Product deleted."); products(); };
      F.onsubmit = async (e) => { e.preventDefault(); keep();
        const out = { title: P.title, description: P.description, collection: P.collection, optionName: P.optionName, status: P.status, track: P.track, stock: P.stock, price: P.price / 100, compare: P.compare ? P.compare / 100 : "", images: imgs, variants: vars.filter((v) => v.name.trim()).map((v) => ({ name: v.name, price: v.price / 100, stock: v.stock })) };
        const r = await X.api(X.id + "/products" + (p ? "/" + p.id : ""), p ? "PUT" : "POST", out); if (!r.ok) return fail(r); X.toast("Saved, live on your published website right away."); products(); };
    };
    draw();
  }

  /* ---------- orders ---------- */
  async function orders(filter) {
    const r = await X.api(X.id + "/orders" + (filter ? "?status=" + filter : "")), st = await X.api(X.id + "/store-stats"); if (!r.ok) return fail(r);
    body().innerHTML = (st.ok ? '<div class="wb-kpis"><div><b>' + st.orders30 + "</b>orders (30 days)</div><div><b>" + rs(st.revenue30) + "</b>order value (30 days)</div><div><b>" + st.toFulfil + "</b>to fulfil</div></div>" : "") +
      '<label class="wb-lab">Show<select id="of"><option value="">All orders</option>' + Object.keys(STATUS).map((k) => '<option value="' + k + '"' + (filter === k ? " selected" : "") + ">" + STATUS[k] + "</option>").join("") + "</select></label>" +
      (r.orders.length ? r.orders.map((o) => '<article class="wb-ord"><div class="wb-row" style="margin:0;justify-content:space-between"><b>#' + o.number + " · " + rs(o.total) + '</b><span class="wb-pill ' + o.status + '">' + esc(STATUS[o.status] || o.status) + "</span></div><small class=\"wb-muted\">" + fmt(o.created_at) + " · " + esc({ online: "Online payment", cod: "Cash on delivery", whatsapp: "WhatsApp order" }[o.method] || o.method) + (o.code ? " · code " + esc(o.code) : "") + "</small>" +
        "<ul>" + o.items.map((i) => "<li>" + esc(i.title) + (i.variant ? " · " + esc(i.variant) : "") + " × " + i.qty + ": " + rs(i.price * i.qty) + "</li>").join("") + "</ul>" +
        '<p class="wb-cust"><b>' + esc(o.customer.name) + '</b> · <a href="tel:' + esc(o.customer.phone) + '">' + esc(o.customer.phone) + "</a>" + (o.customer.email ? " · " + esc(o.customer.email) : "") + "<br>" + esc(o.customer.address) + ", " + esc(o.customer.city) + " " + esc(o.customer.pin) + (o.customer.note ? "<br><i>“" + esc(o.customer.note) + "”</i>" : "") + "</p>" +
        '<div class="wb-row">' + (o.status === "pending" && o.method === "online" ? '<button class="wb-btn sm" data-ver="' + o.id + '">Check payment</button>' : "") + (FLOW[o.status] || []).map((n) => '<button class="wb-btn sm' + (n === "cancelled" ? " danger" : "") + '" data-os="' + o.id + "|" + n + '">' + ACT[n] + "</button>").join("") + "</div></article>").join("")
        : '<p class="wb-empty">No orders' + (filter ? " with this status" : " yet") + ". When customers order on your website they appear here (and you get an email).</p>");
    $("#of").onchange = function () { orders(this.value); };
    $$("[data-os]").forEach((b) => { b.onclick = async () => { const [id, s] = b.dataset.os.split("|"); if (s === "cancelled" && !confirm("Cancel this order?")) return; const x = await X.api(X.id + "/orders/" + id, "POST", { status: s }); if (!x.ok) return fail(x); orders(filter); }; });
    $$("[data-ver]").forEach((b) => { b.onclick = async () => { b.disabled = true; const x = await X.api(X.id + "/orders/" + b.dataset.ver, "POST", { status: "verify" }); if (!x.ok) return fail(x); X.toast(x.status === "paid" ? "Payment confirmed by Cashfree ✓" : "Not paid yet (Cashfree says the payment isn't complete)."); orders(filter); }; });
  }

  /* ---------- discounts ---------- */
  async function discounts() {
    const r = await X.api(X.id + "/discounts"); if (!r.ok) return fail(r);
    body().innerHTML = '<form id="df" class="wb-g5"><input name="code" placeholder="CODE e.g. DIWALI10" required maxlength="30"><select name="kind"><option value="pct">% off</option><option value="flat">₹ off</option></select><input name="value" placeholder="Value" required inputmode="decimal"><input name="min" placeholder="Min order ₹ (optional)" inputmode="decimal"><input name="maxUses" type="number" min="0" placeholder="Max uses (optional)"><input name="expires" type="date" title="Expires (optional)"><button class="wb-btn pri sm">Save code</button></form>' +
      (r.discounts.filter((d) => d.active).length ? '<table class="wb-tbl"><thead><tr><th>Code</th><th>Discount</th><th>Min order</th><th>Used</th><th>Expires</th><th></th></tr></thead><tbody>' + r.discounts.filter((d) => d.active).map((d) => "<tr><td><b>" + esc(d.code) + "</b></td><td>" + (d.kind === "pct" ? d.value + "%" : rs(d.value)) + "</td><td>" + (d.min_total ? rs(d.min_total) : "—") + "</td><td>" + d.uses + (d.max_uses ? " / " + d.max_uses : "") + "</td><td>" + (d.expires_at ? esc(d.expires_at.slice(0, 10)) : "—") + '</td><td><button class="wb-btn sm danger" data-dd="' + esc(d.code) + '">Remove</button></td></tr>').join("") + "</tbody></table>" : '<p class="wb-empty">No discount codes. Customers type the code at checkout; FODO checks it on the server.</p>');
    $("#df").onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const x = await X.api(X.id + "/discounts", "POST", f); if (!x.ok) return fail(x); X.toast("Code " + x.code + " saved."); discounts(); };
    $$("[data-dd]").forEach((b) => { b.onclick = async () => { const x = await X.api(X.id + "/discounts/" + encodeURIComponent(b.dataset.dd), "DELETE"); if (!x.ok) return fail(x); discounts(); }; });
  }

  /* ---------- blog ---------- */
  async function blog() {
    const r = await X.api(X.id + "/posts"); if (!r.ok) return fail(r);
    body().innerHTML = '<div class="wb-row" style="margin-top:0"><button class="wb-btn pri sm" id="npo">+ New post</button><span class="wb-muted">Posts appear at <code>/blog/</code> on your website (and in any “Blog posts” section).</span></div>' +
      (r.posts.length ? '<table class="wb-tbl"><thead><tr><th>Title</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody>' + r.posts.map((x) => "<tr><td><b>" + esc(x.title) + "</b><br><small>/blog/" + esc(x.slug) + "/</small></td><td>" + ({ draft: "Draft", published: "Published", scheduled: "Scheduled" }[x.status] || x.status) + "</td><td>" + fmt(x.published_at || x.publish_at || x.updated_at) + '</td><td><button class="wb-btn sm" data-epo="' + x.id + '">Edit</button></td></tr>').join("") + "</tbody></table>" : '<p class="wb-empty">No posts yet.</p>');
    $("#npo").onclick = () => postForm(null);
    $$("[data-epo]").forEach((b) => { b.onclick = async () => { const x = await X.api(X.id + "/posts/" + b.dataset.epo); if (!x.ok) return fail(x); postForm(x.post); }; });
  }
  function postForm(p) {
    const P = p || { title: "", excerpt: "", body: "", image: "", tags: "", author: "", status: "draft", publish_at: "" };
    const local = (iso) => { if (!iso) return ""; const d = new Date(iso); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };
    body().innerHTML = '<form id="pof" class="wb-pf"><button type="button" class="wb-btn sm" id="back">← Posts</button><h3>' + (p ? "Edit post" : "New post") + "</h3>" +
      '<label class="wb-lab">Title<input name="title" required maxlength="160" value="' + esc(P.title) + '"></label><label class="wb-lab">Short summary <small>shown in lists and search results</small><input name="excerpt" maxlength="300" value="' + esc(P.excerpt || "") + '"></label>' +
      '<div class="wb-g2"><label class="wb-lab">Write <small>**bold** · *italic* · ## heading · - list · [link](https://…) · ![photo](https://…)</small><textarea name="body" rows="16" id="pb">' + esc(P.body || "") + '</textarea></label><div><p class="wb-lab">Preview</p><div class="wb-mdprev" id="pv"></div></div></div>' +
      '<div class="wb-g3"><label class="wb-lab">Cover image<div class="wb-img"><input name="image" value="' + esc(P.image || "") + '" placeholder="https://… or upload"><button type="button" class="wb-ib sm" id="pup" title="Upload">⇪</button></div></label><label class="wb-lab">Tags<input name="tags" maxlength="120" value="' + esc(P.tags || "") + '"></label><label class="wb-lab">Author<input name="author" maxlength="80" value="' + esc(P.author || "") + '"></label></div>' +
      '<div class="wb-g3"><label class="wb-lab">Status<select name="status" id="pst"><option value="draft">Draft</option><option value="published"' + (P.status === "published" ? " selected" : "") + '>Publish now</option><option value="scheduled"' + (P.status === "scheduled" ? " selected" : "") + '>Schedule</option></select></label><label class="wb-lab" id="pat"' + (P.status === "scheduled" ? "" : " hidden") + '>Publish at<input type="datetime-local" name="publishAt" value="' + local(P.publish_at) + '"></label></div>' +
      '<div class="wb-row"><button class="wb-btn pri">Save post</button>' + (p ? '<button type="button" class="wb-btn danger sm" id="del">Delete</button>' : "") + "</div></form>";
    const prev = () => { $("#pv").innerHTML = md($("#pb").value); }; $("#pb").oninput = prev; prev();
    $("#pst").onchange = function () { $("#pat").hidden = this.value !== "scheduled"; };
    $("#back").onclick = blog;
    $("#pup").onclick = () => X.upload((url) => { $("#pof").image.value = url; });
    if ($("#del")) $("#del").onclick = async () => { if (!confirm("Delete this post?")) return; const r = await X.api(X.id + "/posts/" + p.id, "DELETE"); if (!r.ok) return fail(r); blog(); };
    $("#pof").onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); if (f.publishAt) f.publishAt = new Date(f.publishAt).toISOString();
      const r = await X.api(X.id + "/posts" + (p ? "/" + p.id : ""), p ? "PUT" : "POST", f); if (!r.ok) return fail(r); X.toast(f.status === "draft" ? "Draft saved." : f.status === "scheduled" ? "Scheduled." : "Published on your website."); blog(); };
  }

  /* ---------- settings + payments ---------- */
  async function settings() {
    const doc = X.doc(), S = (doc.settings && doc.settings.store) || {}, sh = S.shipping || {}, tx = S.tax || {}, biz = (doc.settings && doc.settings.business) || {};
    const pay = await X.api(X.id + "/payments");
    const hasShop = doc.pages.some((p) => p.sections.some((x) => x.type === "products")), hasBlog = doc.pages.some((p) => p.sections.some((x) => x.type === "blog"));
    body().innerHTML = '<p class="wb-muted">Store settings are part of your website, they go live when you <b>Publish</b>. Products, orders and posts update instantly.</p>' +
      '<form id="sf"><h3>Payment methods customers can choose</h3>' +
      '<label class="wb-ck"><input type="checkbox" name="cod"' + (S.cod !== false ? " checked" : "") + "> Cash on delivery</label>" +
      '<label class="wb-ck"><input type="checkbox" name="whatsapp"' + (S.whatsapp ? " checked" : "") + (biz.whatsapp ? "" : " disabled") + "> Order on WhatsApp " + (biz.whatsapp ? "(" + esc(biz.whatsapp) + ")" : "<small>(add a WhatsApp number in More → Business details)</small>") + "</label>" +
      '<label class="wb-ck"><input type="checkbox" name="online"' + (S.online ? " checked" : "") + (pay.ok && pay.connected ? "" : " disabled") + "> Online payment: UPI, cards, netbanking (your Cashfree account) " + (pay.ok && pay.connected ? "" : "<small>(connect Cashfree below first)</small>") + "</label>" +
      '<h3>Shipping &amp; tax</h3><div class="wb-g3"><label class="wb-lab">Shipping charge (₹)<input name="flat" inputmode="decimal" value="' + esc(sh.flat || "") + '" placeholder="0"></label><label class="wb-lab">Free shipping above (₹)<input name="freeAbove" inputmode="decimal" value="' + esc(sh.freeAbove || "") + '" placeholder="optional"></label><label class="wb-lab">GST / tax %<input name="pct" inputmode="decimal" value="' + esc(tx.pct || "") + '" placeholder="0"></label></div>' +
      '<label class="wb-ck"><input type="checkbox" name="inclusive"' + (tx.inclusive !== false ? " checked" : "") + "> My prices already include tax</label>" +
      '<label class="wb-lab">Send new-order emails to<input name="notifyEmail" type="email" value="' + esc((doc.settings && doc.settings.notifyEmail) || "") + '"></label>' +
      '<div class="wb-row"><button class="wb-btn pri sm">Save settings</button></div></form>' +
      '<h3>Pages</h3><div class="wb-row">' + (hasShop ? '<span class="wb-muted">✓ Your website has a Products section.</span>' : '<button class="wb-btn sm" id="addshop">Add a Shop page</button>') + (hasBlog ? '<span class="wb-muted">✓ Blog section added.</span>' : '<button class="wb-btn sm" id="addblog">Add a Blog page</button>') + "</div>" +
      '<h3>Online payments (Cashfree)</h3><div id="pay"></div>';
    $("#sf").onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.target), num = (k) => String(f.get(k) || "").replace(/[^\d.]/g, "");
      X.change(() => { const d = X.doc(); d.settings.store = { currency: "INR", cod: !!f.get("cod"), whatsapp: !!f.get("whatsapp"), online: !!f.get("online"), shipping: { flat: num("flat"), freeAbove: num("freeAbove") }, tax: { pct: num("pct"), inclusive: !!f.get("inclusive") } }; d.settings.notifyEmail = String(f.get("notifyEmail") || "").trim(); }, true);
      X.toast("Saved, click Publish to make it live."); };
    const addPage = (slug, title, sec) => { const d = X.doc(); if (d.pages.some((p) => p.slug === slug)) return X.toast("A “" + slug + "” page already exists.", true);
      const nav = d.pages[0].sections.find((x) => x.type === "navbar"), foot = d.pages[0].sections.find((x) => x.type === "footer");
      X.change(() => { X.doc().pages.push({ slug, title, seo: {}, sections: [nav && JSON.parse(JSON.stringify(nav)), sec, foot && JSON.parse(JSON.stringify(foot))].filter(Boolean) }); }); X.toast(title + " page added."); settings(); };
    if ($("#addshop")) $("#addshop").onclick = () => addPage("shop", "Shop", { type: "products", props: { title: "Shop", subtitle: "", limit: 24, collection: "" } });
    if ($("#addblog")) $("#addblog").onclick = () => addPage("articles", "Blog", { type: "blog", props: { title: "Blog", subtitle: "", limit: 12 } });
    const el = $("#pay");
    if (!pay.ok) { el.textContent = pay.reason; return; }
    if (!pay.available) { el.innerHTML = '<p class="wb-muted">Online payments for stores aren\'t switched on by FODO yet. Cash on delivery and WhatsApp orders work now.</p>'; return; }
    if (pay.connected) { el.innerHTML = '<p>🟢 Connected, ' + esc(pay.meta.mode === "production" ? "Live (real payments)" : "Test mode") + " · App ID " + esc(pay.meta.appId) + " · " + fmt(pay.updatedAt) + '</p><div class="wb-row"><button class="wb-btn sm danger" id="pdis">Disconnect</button></div><p class="wb-muted">Money goes straight to YOUR Cashfree account. FODO stores your secret key encrypted and never shows it again.</p>';
      $("#pdis").onclick = async () => { if (!confirm("Disconnect Cashfree? Online payment stops working on your store.")) return; const r = await X.api(X.id + "/payments", "DELETE"); if (!r.ok) return fail(r); if ((X.doc().settings.store || {}).online) X.change(() => { X.doc().settings.store.online = false; }, true); settings(); }; return; }
    el.innerHTML = '<ol class="wb-muted"><li>Create a free account at <a href="https://merchant.cashfree.com" target="_blank" rel="noopener">merchant.cashfree.com</a> and complete KYC.</li><li>Developers → API Keys → copy the <b>App ID</b> and <b>Secret Key</b> (Test keys first if you want to try it).</li><li>Paste them here. FODO checks them with Cashfree, then stores the secret encrypted.</li></ol>' +
      '<form id="pcf" class="wb-g3"><input name="appId" placeholder="App ID" required autocomplete="off"><input name="secret" type="password" placeholder="Secret Key" required autocomplete="off"><select name="mode"><option value="sandbox">Test mode</option><option value="production">Live (real money)</option></select><button class="wb-btn pri sm">Connect</button></form>';
    $("#pcf").onsubmit = async (e) => { e.preventDefault(); const b = e.target.querySelector("button"); b.disabled = true; b.textContent = "Checking with Cashfree…"; const f = Object.fromEntries(new FormData(e.target)); const r = await X.api(X.id + "/payments", "POST", f); e.target.secret.value = ""; b.disabled = false; b.textContent = "Connect"; if (!r.ok) return fail(r); X.toast("Cashfree connected (" + (r.mode === "production" ? "live" : "test") + "). Tick “Online payment” and Publish."); settings(); };
  }
  go(tab || "products");
}

/* storefront data for the editor preview (real products/posts of this website) */
export async function loadStoreData(X) {
  const [p, b] = await Promise.all([X.api(X.id + "/products"), X.api(X.id + "/posts")]);
  const doc = X.doc(), st = (doc.settings && doc.settings.store) || {};
  return { products: p.ok ? p.products.filter((x) => x.status === "active").map((x) => ({ id: x.id, slug: x.slug, title: x.title, price: x.variants.length ? Math.min.apply(null, x.variants.map((v) => v.price)) : x.price, compare: x.compare, image: x.images[0] || "", collection: x.collection, opts: x.variants.length ? 1 : 0, stock: x.track && !x.variants.length ? x.stock : null })) : [], posts: b.ok ? b.posts.filter((x) => x.status === "published") : [], currency: st.currency };
}
