/* FODO Website Builder, store + blog (v29). Products (variants, stock, images, collections), orders (online payment with the
   MERCHANT'S OWN Cashfree account, cash on delivery, WhatsApp orders), discount codes, shipping + tax rules, order emails,
   blog posts (draft / scheduled / published). Money is stored in paise (integers). Tenant rule: every merchant function gets a
   site already resolved by sites.siteFor() (owner of the site, or a FODO owner). Public checkout trusts NOTHING from the browser
   except the product ids, variant index and quantity: prices, stock, discounts, shipping and tax are computed here.
   The merchant's payment secret is encrypted (AES-GCM, key from SITES_SECRET_KEY) and never returned to any browser. */
import { db as accountsDb, nowIso, randId, sha256, sendMail } from "./accounts.js";

const DDL = [
  "CREATE TABLE IF NOT EXISTS site_products (id TEXT PRIMARY KEY, site_id TEXT, slug TEXT, title TEXT, description TEXT, price INTEGER, compare INTEGER, images TEXT, option_name TEXT, variants TEXT, track INTEGER, stock INTEGER, collection TEXT, status TEXT, sort INTEGER, created_at TEXT, updated_at TEXT, UNIQUE(site_id, slug))",
  "CREATE TABLE IF NOT EXISTS site_orders (id TEXT PRIMARY KEY, site_id TEXT, number INTEGER, token TEXT, status TEXT, items TEXT, subtotal INTEGER, discount INTEGER, shipping INTEGER, tax INTEGER, total INTEGER, code TEXT, customer TEXT, method TEXT, pay_ref TEXT, paid_at TEXT, note TEXT, stock_done INTEGER, created_at TEXT, updated_at TEXT)",
  "CREATE INDEX IF NOT EXISTS site_orders_site ON site_orders(site_id, created_at)",
  "CREATE TABLE IF NOT EXISTS site_discounts (id TEXT PRIMARY KEY, site_id TEXT, code TEXT, kind TEXT, value INTEGER, min_total INTEGER, max_uses INTEGER, uses INTEGER, expires_at TEXT, active INTEGER, created_at TEXT, UNIQUE(site_id, code))",
  "CREATE TABLE IF NOT EXISTS site_posts (id TEXT PRIMARY KEY, site_id TEXT, slug TEXT, title TEXT, excerpt TEXT, body TEXT, image TEXT, tags TEXT, author TEXT, status TEXT, publish_at TEXT, published_at TEXT, created_at TEXT, updated_at TEXT, UNIQUE(site_id, slug))",
  "CREATE TABLE IF NOT EXISTS site_secrets (site_id TEXT, provider TEXT, enc TEXT, meta TEXT, updated_at TEXT, PRIMARY KEY (site_id, provider))",
];
const made = new WeakSet();
export async function shopDb(env) { const d = await accountsDb(env); if (!d) return null; if (!made.has(d)) { await d.batch(DDL.map((s) => d.prepare(s))); made.add(d); } return d; }
const err = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const clip = (s, n) => { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n) : s; };
const paise = (x) => { const n = Math.round(Number(String(x == null ? "" : x).replace(/[^\d.]/g, "")) * 100); return isFinite(n) && n >= 0 && n < 1e11 ? n : 0; };
const slugify = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "item";
const J = (s, d) => { try { return JSON.parse(s); } catch (e) { return d; } };
const rowP = (r) => r && Object.assign({}, r, { images: J(r.images, []), variants: J(r.variants, []), track: !!r.track, optionName: r.option_name });

/* ---------- products ---------- */
export async function products(env, siteId, opt) {
  const d = await shopDb(env); const rows = (await d.prepare("SELECT * FROM site_products WHERE site_id=?1" + (opt && opt.live ? " AND status='active'" : "") + " ORDER BY sort, created_at DESC LIMIT 500").bind(siteId).all()).results || [];
  return rows.map(rowP);
}
export async function saveProduct(env, s, body, pid) {
  const d = await shopDb(env), now = nowIso(), title = clip(body.title, 140).trim(); if (title.length < 2) throw err("Give the product a name.");
  const n = ((await d.prepare("SELECT COUNT(*) AS n FROM site_products WHERE site_id=?1").bind(s.id).first()) || {}).n || 0; if (!pid && n >= 2000) throw err("Product limit reached.");
  const variants = (Array.isArray(body.variants) ? body.variants : []).slice(0, 50).map((v) => ({ name: clip(v.name, 60).trim(), price: v.price != null && v.price !== "" ? paise(v.price) : paise(body.price), stock: Math.max(0, Math.min(1e6, parseInt(v.stock, 10) || 0)), sku: clip(v.sku, 40) })).filter((v) => v.name);
  const images = (Array.isArray(body.images) ? body.images : []).map((u) => String(u || "").trim()).filter((u) => /^(https:\/\/|\/api\/sites\/media\/[a-z0-9]{20}$)/.test(u)).slice(0, 12);
  let slug = slugify(body.slug || title); const clash = await d.prepare("SELECT id FROM site_products WHERE site_id=?1 AND slug=?2").bind(s.id, slug).first(); if (clash && clash.id !== pid) slug += "-" + randId(4);
  const v = [slug, title, clip(body.description, 8000), paise(body.price), body.compare ? paise(body.compare) : 0, JSON.stringify(images), clip(body.optionName || "Option", 30), JSON.stringify(variants), body.track ? 1 : 0, Math.max(0, Math.min(1e6, parseInt(body.stock, 10) || 0)), clip(body.collection, 60).trim(), body.status === "draft" ? "draft" : "active", parseInt(body.sort, 10) || 0];
  if (!v[3] && !variants.length) throw err("Set a price.");
  if (pid) { const r = await d.prepare("UPDATE site_products SET slug=?3, title=?4, description=?5, price=?6, compare=?7, images=?8, option_name=?9, variants=?10, track=?11, stock=?12, collection=?13, status=?14, sort=?15, updated_at=?16 WHERE id=?1 AND site_id=?2").bind(pid, s.id, ...v, now).run(); if (!r.meta.changes) throw err("Product not found.", 404); return { id: pid, slug }; }
  const id = "pr_" + randId(12); await d.prepare("INSERT INTO site_products (id, site_id, slug, title, description, price, compare, images, option_name, variants, track, stock, collection, status, sort, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?16)").bind(id, s.id, ...v, now).run();
  return { id, slug };
}
export async function deleteProduct(env, s, pid) { const d = await shopDb(env); await d.prepare("DELETE FROM site_products WHERE id=?1 AND site_id=?2").bind(pid, s.id).run(); return { deleted: true }; }
export async function productBySlug(env, siteId, slug) { const d = await shopDb(env); return rowP(await d.prepare("SELECT * FROM site_products WHERE site_id=?1 AND slug=?2 AND status='active'").bind(siteId, slug).first()); }

/* ---------- discounts ---------- */
export async function discounts(env, s) { const d = await shopDb(env); return (await d.prepare("SELECT * FROM site_discounts WHERE site_id=?1 ORDER BY created_at DESC").bind(s.id).all()).results || []; }
export async function saveDiscount(env, s, b) {
  const code = clip(b.code, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, ""); if (code.length < 3) throw err("Code: 3–30 letters/numbers.");
  const kind = b.kind === "flat" ? "flat" : "pct", value = kind === "pct" ? Math.max(1, Math.min(90, parseInt(b.value, 10) || 0)) : paise(b.value); if (!value) throw err("Set the discount value.");
  const d = await shopDb(env); await d.prepare("INSERT INTO site_discounts (id, site_id, code, kind, value, min_total, max_uses, uses, expires_at, active, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,0,?8,1,?9) ON CONFLICT(site_id, code) DO UPDATE SET kind=?4, value=?5, min_total=?6, max_uses=?7, expires_at=?8, active=1")
    .bind("dc_" + randId(10), s.id, code, kind, value, b.min ? paise(b.min) : 0, parseInt(b.maxUses, 10) || 0, b.expires ? clip(b.expires, 10) + "T23:59:59Z" : null, nowIso()).run();
  return { code };
}
export async function deleteDiscount(env, s, code) { const d = await shopDb(env); await d.prepare("UPDATE site_discounts SET active=0 WHERE site_id=?1 AND code=?2").bind(s.id, String(code).toUpperCase()).run(); return { removed: true }; }

/* ---------- store settings + the merchant's payment account ---------- */
async function key(env) { const k = String(env.SITES_SECRET_KEY || ""); if (k.length < 32) return null; const raw = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("fodo-sites|" + k))); return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]); }
const b64 = (u) => { let s = ""; u.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); }, unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function savePayment(env, s, b) {
  const k = await key(env); if (!k) throw err("Online payments aren't switched on by FODO yet (SITES_SECRET_KEY).", 503);
  const appId = clip(b.appId, 120).trim(), secret = clip(b.secret, 200).trim(), mode = b.mode === "production" ? "production" : "sandbox"; if (!appId || !secret) throw err("Enter the App ID and Secret Key from your Cashfree dashboard.");
  if (mode === "production" && /^TEST/i.test(appId)) throw err("This looks like a TEST App ID, choose Test mode or use your PROD keys.");
  const r = await fetch((mode === "production" ? "https://api.cashfree.com" : "https://sandbox.cashfree.com") + "/pg/orders/fodo-check-" + randId(6), { headers: { "x-client-id": appId, "x-client-secret": secret, "x-api-version": "2025-01-01" }, signal: AbortSignal.timeout(10000) }).catch(() => null);
  if (r && r.status === 401) throw err("Cashfree rejected these keys, check the App ID and Secret Key (and Test vs Production).");
  const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(JSON.stringify({ appId, secret }))));
  const d = await shopDb(env); await d.prepare("INSERT INTO site_secrets (site_id, provider, enc, meta, updated_at) VALUES (?1,'cashfree',?2,?3,?4) ON CONFLICT(site_id, provider) DO UPDATE SET enc=?2, meta=?3, updated_at=?4").bind(s.id, b64(iv) + "." + b64(ct), JSON.stringify({ mode, appId: appId.slice(0, 6) + "…" + appId.slice(-4) }), nowIso()).run();
  return { connected: true, mode };
}
/* decrypted keys are applied last so they win over the masked display copy in meta */
async function payCreds(env, siteId) { const k = await key(env); if (!k) return null; const d = await shopDb(env), r = await d.prepare("SELECT enc, meta FROM site_secrets WHERE site_id=?1 AND provider='cashfree'").bind(siteId).first(); if (!r) return null; const [iv, ct] = r.enc.split("."); try { return Object.assign(J(r.meta, {}), JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, k, unb64(ct))))); } catch (e) { return null; } }
export async function paymentStatus(env, s) { const d = await shopDb(env), r = await d.prepare("SELECT meta, updated_at FROM site_secrets WHERE site_id=?1 AND provider='cashfree'").bind(s.id).first(); return { available: !!(await key(env)), connected: !!r, meta: r ? J(r.meta, {}) : null, updatedAt: r && r.updated_at }; }
export async function removePayment(env, s) { const d = await shopDb(env); await d.prepare("DELETE FROM site_secrets WHERE site_id=?1").bind(s.id).run(); return { removed: true }; }

/* ---------- checkout (public): the server prices everything ---------- */
export function quote(store, lines, disc) {
  const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0); let discount = 0;
  if (disc) discount = disc.kind === "pct" ? Math.round(subtotal * disc.value / 100) : Math.min(subtotal, disc.value);
  const after = subtotal - discount, sh = store.shipping || {}, shipping = after <= 0 ? 0 : sh.freeAbove && after >= paise(sh.freeAbove) ? 0 : paise(sh.flat || 0);
  const pct = Math.max(0, Math.min(40, +((store.tax || {}).pct) || 0)), inclusive = (store.tax || {}).inclusive !== false, tax = pct ? (inclusive ? Math.round(after - after / (1 + pct / 100)) : Math.round(after * pct / 100)) : 0;
  return { subtotal, discount, shipping, tax, total: after + shipping + (inclusive ? 0 : tax), taxInclusive: inclusive };
}
export async function checkout(env, siteId, body, ip) {
  const d = await shopDb(env), s = await d.prepare("SELECT id, name, slug, status, published FROM sites WHERE id=?1 AND deleted_at IS NULL").bind(String(siteId)).first(); if (!s || s.status !== "live") throw err("This store isn't open.", 404);
  const site = J(s.published, {}), store = (site.settings && site.settings.store) || {}, biz = (site.settings && site.settings.business) || {};
  const method = ["online", "cod", "whatsapp"].indexOf(body.method) > -1 ? body.method : "cod";
  if (method === "online" && !store.online) throw err("Online payment isn't available, choose another option."); if (method === "cod" && store.cod === false) throw err("Cash on delivery isn't available."); if (method === "whatsapp" && !(store.whatsapp && biz.whatsapp)) throw err("WhatsApp orders aren't available.");
  const c = body.customer || {}, cust = { name: clip(c.name, 80).trim(), phone: clip(c.phone, 20).replace(/[^\d+]/g, ""), email: clip(c.email, 120).trim(), address: clip(c.address, 300).trim(), city: clip(c.city, 80).trim(), pin: clip(c.pin, 10).replace(/\D/g, ""), note: clip(c.note, 300) };
  if (cust.name.length < 2 || cust.phone.replace(/\D/g, "").length < 10 || cust.address.length < 4 || cust.pin.length < 5) throw err("Please fill name, phone, address and PIN code.");
  if (cust.email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(cust.email)) throw err("Please check the email address.");
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 50); if (!items.length) throw err("Your cart is empty.");
  const ids = [...new Set(items.map((i) => String(i.id)))].slice(0, 50), P = {};
  for (const id of ids) { const r = await d.prepare("SELECT * FROM site_products WHERE id=?1 AND site_id=?2 AND status='active'").bind(id, s.id).first(); if (r) P[id] = rowP(r); }
  const lines = [];
  for (const it of items) {
    const p = P[String(it.id)]; if (!p) throw err("A product in your cart is no longer available, please review your cart.", 409);
    const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1)), vi = parseInt(it.v, 10), v = p.variants.length ? p.variants[vi] : null; if (p.variants.length && !v) throw err("Choose an option for " + p.title + ".");
    const have = p.track ? (v ? v.stock : p.stock) : Infinity; if (qty > have) throw err((p.title + (v ? " · " + v.name : "")) + (have > 0 ? ": only " + have + " left." : " is sold out."), 409);
    lines.push({ id: p.id, title: p.title, variant: v ? v.name : "", vi: v ? vi : -1, qty, price: v ? v.price : p.price });
  }
  let disc = null; const code = clip(body.code, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  if (code) { disc = await d.prepare("SELECT * FROM site_discounts WHERE site_id=?1 AND code=?2 AND active=1").bind(s.id, code).first(); const sub = lines.reduce((a, l) => a + l.price * l.qty, 0);
    if (!disc || (disc.expires_at && Date.parse(disc.expires_at) < Date.now()) || (disc.max_uses && disc.uses >= disc.max_uses) || (disc.min_total && sub < disc.min_total)) throw err("That discount code isn't valid for this order."); }
  const q = quote(store, lines, disc); if (q.total < 100 && method === "online") throw err("Order total is too small for online payment.");
  const recent = ((await d.prepare("SELECT COUNT(*) AS n FROM site_orders WHERE site_id=?1 AND created_at > ?2 AND json_extract(customer,'$.phone')=?3").bind(s.id, new Date(Date.now() - 3600e3).toISOString(), cust.phone).first()) || {}).n || 0; if (recent >= 6) throw err("Too many orders from this phone in the last hour.", 429);
  const num = (((await d.prepare("SELECT MAX(number) AS n FROM site_orders WHERE site_id=?1").bind(s.id).first()) || {}).n || 1000) + 1, id = "or_" + randId(14), token = randId(24), now = nowIso();
  const status = method === "online" ? "pending" : method === "cod" ? "cod" : "whatsapp";
  await d.prepare("INSERT INTO site_orders (id, site_id, number, token, status, items, subtotal, discount, shipping, tax, total, code, customer, method, note, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?16)")
    .bind(id, s.id, num, token, status, JSON.stringify(lines), q.subtotal, q.discount, q.shipping, q.tax, q.total, disc ? disc.code : null, JSON.stringify(cust), method, cust.note, now).run();
  if (disc) await d.prepare("UPDATE site_discounts SET uses=uses+1 WHERE id=?1").bind(disc.id).run();
  const ret = /^https:\/\/[a-z0-9.-]+(:\d+)?\/[\w\-\/]*$/i.test(String(body.ret || "")) ? String(body.ret) : null;
  const out = { ok: true, order: id, number: num, token, total: q.total };
  if (method === "online") {
    const cr = await payCreds(env, s.id); if (!cr) throw err("The store's online payment isn't connected, choose another option.");
    const base = cr.mode === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
    const r = await fetch(base + "/orders", { method: "POST", headers: { "x-client-id": cr.appId, "x-client-secret": cr.secret, "x-api-version": "2025-01-01", "content-type": "application/json" }, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ order_id: id, order_amount: q.total / 100, order_currency: "INR", customer_details: { customer_id: "c" + (await sha256(cust.phone)).slice(0, 20), customer_phone: cust.phone.replace(/\D/g, "").slice(-10), customer_name: cust.name, customer_email: cust.email || undefined }, order_meta: ret ? { return_url: ret + "order/" + id + "/?t=" + token } : undefined, order_note: clip(s.name + " order #" + num, 200) }) });
    const j = await r.json().catch(() => ({})); if (!r.ok || !j.payment_session_id) { await d.prepare("UPDATE site_orders SET status='cancelled', note=?2 WHERE id=?1").bind(id, "payment start failed").run(); throw err("The payment page couldn't start (" + clip(j.message || r.status, 100) + "). Choose cash on delivery or try again.", 502); }
    await d.prepare("UPDATE site_orders SET pay_ref=?2 WHERE id=?1").bind(id, String(j.cf_order_id || "")).run();
    out.payment = { session: j.payment_session_id, mode: cr.mode };
  } else { await settleStock(env, id); await notify(env, s, site, id); }
  if (method === "whatsapp") out.whatsapp = "https://wa.me/" + String(biz.whatsapp).replace(/\D/g, "") + "?text=" + encodeURIComponent("Hi, I placed order #" + num + " on your website:\n" + lines.map((l) => "• " + l.title + (l.variant ? " (" + l.variant + ")" : "") + " × " + l.qty).join("\n") + "\nTotal: ₹" + (q.total / 100) + "\nName: " + cust.name + "\nAddress: " + cust.address + ", " + cust.city + " " + cust.pin);
  return out;
}
async function settleStock(env, orderId) {   // decrement stock once (cod / whatsapp at order time, online when paid)
  const d = await shopDb(env), o = await d.prepare("SELECT * FROM site_orders WHERE id=?1").bind(orderId).first(); if (!o || o.stock_done) return;
  for (const l of J(o.items, [])) { const p = rowP(await d.prepare("SELECT * FROM site_products WHERE id=?1").bind(l.id).first()); if (!p || !p.track) continue;
    if (l.vi > -1 && p.variants[l.vi]) { p.variants[l.vi].stock = Math.max(0, p.variants[l.vi].stock - l.qty); await d.prepare("UPDATE site_products SET variants=?2 WHERE id=?1").bind(p.id, JSON.stringify(p.variants)).run(); }
    else await d.prepare("UPDATE site_products SET stock=MAX(0, stock-?2) WHERE id=?1").bind(p.id, l.qty).run(); }
  await d.prepare("UPDATE site_orders SET stock_done=1 WHERE id=?1").bind(orderId).run();
}
async function notify(env, s, site, orderId) {
  const d = await shopDb(env), o = await d.prepare("SELECT * FROM site_orders WHERE id=?1").bind(orderId).first(), c = J(o.customer, {}), items = J(o.items, []), rs = (n) => "₹" + (n / 100).toLocaleString("en-IN");
  const tbl = "<table>" + items.map((l) => "<tr><td>" + esc(l.title) + (l.variant ? " · " + esc(l.variant) : "") + " × " + l.qty + "</td><td>" + rs(l.price * l.qty) + "</td></tr>").join("") + "<tr><td><b>Total</b></td><td><b>" + rs(o.total) + "</b></td></tr></table>";
  const to = (site.settings || {}).notifyEmail;
  try { if (to) await sendMail(env, to, "New order #" + o.number + ": " + rs(o.total) + " (" + o.method + ")", "<p>New order on <b>" + esc(s.name) + "</b>.</p>" + tbl + "<p><b>" + esc(c.name) + "</b> · " + esc(c.phone) + " · " + esc(c.email) + "<br>" + esc(c.address) + ", " + esc(c.city) + " " + esc(c.pin) + "</p><p>Manage it in FODO Website Builder → Store → Orders.</p>"); } catch (e) {}
  try { if (c.email) await sendMail(env, c.email, "Your order #" + o.number + " at " + s.name, "<p>Thank you, " + esc(c.name) + "! We received your order.</p>" + tbl + "<p>Payment: " + esc({ cod: "cash on delivery", online: "paid online", whatsapp: "confirm on WhatsApp" }[o.method] || o.method) + "</p>"); } catch (e) {}
}
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/* order page / payment return: verify with Cashfree (never trust the redirect) */
export async function orderFor(env, siteId, orderId, token) {
  const d = await shopDb(env), o = await d.prepare("SELECT * FROM site_orders WHERE id=?1 AND site_id=?2").bind(String(orderId), String(siteId)).first();
  if (!o || !token || o.token !== String(token)) return null;
  if (o.status === "pending" && o.method === "online") {
    const cr = await payCreds(env, siteId);
    if (cr) { const r = await fetch((cr.mode === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg") + "/orders/" + encodeURIComponent(o.id), { headers: { "x-client-id": cr.appId, "x-client-secret": cr.secret, "x-api-version": "2025-01-01" }, signal: AbortSignal.timeout(10000) }).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : {};
      if (j.order_status === "PAID" && Math.abs(+j.order_amount * 100 - o.total) < 1) { const u = await d.prepare("UPDATE site_orders SET status='paid', paid_at=?2, updated_at=?2 WHERE id=?1 AND status='pending'").bind(o.id, nowIso()).run(); if (u.meta.changes) { await settleStock(env, o.id); const s = await d.prepare("SELECT * FROM sites WHERE id=?1").bind(siteId).first(); await notify(env, s, J(s.published, {}), o.id); } o.status = "paid"; } }
  }
  return Object.assign({}, o, { items: J(o.items, []), customer: undefined });
}
export async function orders(env, s, q) { const d = await shopDb(env); return ((await d.prepare("SELECT * FROM site_orders WHERE site_id=?1" + (q && q.status ? " AND status=?2" : "") + " ORDER BY created_at DESC LIMIT 300").bind(...[s.id].concat(q && q.status ? [q.status] : [])).all()).results || []).map((o) => Object.assign(o, { items: J(o.items, []), customer: J(o.customer, {}), token: undefined })); }
const FLOW = { pending: ["cancelled"], paid: ["shipped", "cancelled", "refunded"], cod: ["shipped", "cancelled", "paid"], whatsapp: ["cod", "paid", "cancelled"], shipped: ["delivered", "cancelled"], delivered: ["refunded"], cancelled: [], refunded: [] };
export async function setOrderStatus(env, s, oid, status) {
  const d = await shopDb(env), o = await d.prepare("SELECT status FROM site_orders WHERE id=?1 AND site_id=?2").bind(oid, s.id).first(); if (!o) throw err("Order not found.", 404);
  if ((FLOW[o.status] || []).indexOf(status) < 0) throw err("An order that is “" + o.status + "” can't become “" + status + "”.");
  await d.prepare("UPDATE site_orders SET status=?3, updated_at=?4 WHERE id=?1 AND site_id=?2").bind(oid, s.id, status, nowIso()).run(); return { status };
}
export async function storeStats(env, s) { const d = await shopDb(env), since = new Date(Date.now() - 30 * 864e5).toISOString(); const r = await d.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN status IN ('paid','shipped','delivered','cod') THEN total ELSE 0 END) AS rev, SUM(CASE WHEN status IN ('paid','cod','whatsapp') THEN 1 ELSE 0 END) AS open FROM site_orders WHERE site_id=?1 AND created_at>?2").bind(s.id, since).first(); return { orders30: r.n || 0, revenue30: r.rev || 0, toFulfil: r.open || 0 }; }

/* ---------- blog ---------- */
export async function posts(env, siteId, opt) {
  const d = await shopDb(env), live = opt && opt.live, now = nowIso();
  const rows = (await d.prepare("SELECT id, slug, title, excerpt, image, tags, author, status, publish_at, published_at, updated_at" + (opt && opt.body ? ", body" : "") + " FROM site_posts WHERE site_id=?1" + (live ? " AND (status='published' OR (status='scheduled' AND publish_at<=?2))" : "") + " ORDER BY COALESCE(published_at, publish_at, created_at) DESC LIMIT 200").bind(...[siteId].concat(live ? [now] : [])).all()).results || [];
  return rows.map((p) => (p.status === "scheduled" && p.publish_at <= now ? Object.assign(p, { status: "published", published_at: p.publish_at }) : p));
}
export async function postBySlug(env, siteId, slug) { const L = await posts(env, siteId, { live: true, body: true }); return L.find((p) => p.slug === slug) || null; }
export async function getPost(env, s, id) { const d = await shopDb(env); return await d.prepare("SELECT * FROM site_posts WHERE id=?1 AND site_id=?2").bind(id, s.id).first(); }
export async function savePost(env, s, b, id) {
  const d = await shopDb(env), now = nowIso(), title = clip(b.title, 160).trim(); if (title.length < 3) throw err("Give the post a title.");
  const status = ["draft", "published", "scheduled"].indexOf(b.status) > -1 ? b.status : "draft", at = status === "scheduled" ? (Date.parse(b.publishAt) ? new Date(Date.parse(b.publishAt)).toISOString() : null) : null; if (status === "scheduled" && !at) throw err("Pick the date and time to publish.");
  let slug = slugify(b.slug || title); const clash = await d.prepare("SELECT id FROM site_posts WHERE site_id=?1 AND slug=?2").bind(s.id, slug).first(); if (clash && clash.id !== id) slug += "-" + randId(4);
  const image = /^(https:\/\/|\/api\/sites\/media\/[a-z0-9]{20}$)/.test(String(b.image || "")) ? String(b.image) : "";
  const v = [slug, title, clip(b.excerpt, 300), clip(b.body, 60000), image, clip(b.tags, 120), clip(b.author, 80), status, at];
  if (id) { const cur = await getPost(env, s, id); if (!cur) throw err("Post not found.", 404); await d.prepare("UPDATE site_posts SET slug=?3, title=?4, excerpt=?5, body=?6, image=?7, tags=?8, author=?9, status=?10, publish_at=?11, published_at=?12, updated_at=?13 WHERE id=?1 AND site_id=?2").bind(id, s.id, ...v, status === "published" ? cur.published_at || now : null, now).run(); return { id, slug }; }
  id = "po_" + randId(12); await d.prepare("INSERT INTO site_posts (id, site_id, slug, title, excerpt, body, image, tags, author, status, publish_at, published_at, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?13)").bind(id, s.id, ...v, status === "published" ? now : null, now).run();
  return { id, slug };
}
export async function deletePost(env, s, id) { const d = await shopDb(env); await d.prepare("DELETE FROM site_posts WHERE id=?1 AND site_id=?2").bind(id, s.id).run(); return { deleted: true }; }
