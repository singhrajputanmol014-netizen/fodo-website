/* FODO Growth Lab account API (v13). All routes under /api/account/…
 *   GET  config                 → { enabled, google, email, payments, autoRenew, plans, packs }   (no secrets)
 *   GET  me                     → { user } or { user: null }
 *   POST google {credential}    → sign in with a Google ID token
 *   POST otp/send {email}       → 6-digit code by email (10 min, 5 tries, 1/min and 5/hour per email, 30/hour per network — mobile networks share IPs)
 *   POST otp/verify {email, code}
 *   POST logout · POST profile {name, phone}
 *   GET  history[?client=]      → your X-Rays (Starter+) · GET ledger → credit history
 *   POST checkout {kind: "plan"|"pack", item, phone, autoRenew?} → { paymentSessionId | subsSessionId, mode }
 *   POST verify {order_id | subscription_id}  → re-reads the payment from Cashfree and credits it (idempotent)
 *   POST cancel                 → stop auto-renew
 *   GET/POST team (Agency) · GET/POST clients (Agency) · POST brand (Agency white-label)
 *   POST webhook/cashfree       → signed Cashfree webhooks (payments + subscriptions)
 */
import { waOn, verifyFirebase, firebaseOn, logEvent, EVENT_KINDS, isOwner, OWNER_EMAILS, json, accountsOn, db, count, ipHash, sessionUser, newSession, endSession, sameOrigin, userByEmail, createUser, cleanEmail, billingUser, activePlan, publicUser,
  verifyGoogle, sendMail, otpHash, cfOn, cf, verifyWebhook, settleOrder, grantPlan, randId, sha256, nowIso, refundCredit } from "../../_lib/accounts.js";
import { PLANS, PACKS, rank, has, publicPlans } from "../../_lib/plans.js";
import { log, providers, outbound } from "../../_lib/xray-core.js";

const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const SITE = (request) => new URL(request.url).origin;

export async function onRequest(ctx) {
  const { request, env, params } = ctx, path = [].concat(params.path || []).join("/"), m = request.method;
  try {
    if (path === "config" && m === "GET") return config(env);
    if (!accountsOn(env)) return json({ ok: false, disabled: true, reason: "Accounts are not switched on yet." }, 503);
    if (path === "webhook/cashfree" && m === "POST") return await webhook(request, env);
    if (path === "webhook/whatsapp") return await waWebhook(request, env, m);
    if (m === "POST" && (!sameOrigin(request) || !/json/.test(request.headers.get("content-type") || ""))) return json({ ok: false, reason: "Bad request." }, 403);
    if (path === "me" && m === "GET") { const u = await sessionUser(env, request); if (!u) return json({ ok: true, user: null });
      const ob = await billingUser(env, u), pu = publicUser(u, ob), sub = await (await db(env)).prepare("SELECT plan FROM acct_subs WHERE user_id=?1 AND status='ACTIVE' LIMIT 1").bind(ob.id).first();
      pu.autoRenew = sub ? sub.plan : null; pu.owner = ob.id === u.id; return json({ ok: true, user: pu }); }
    if (path === "google" && m === "POST") return await google(request, env);
    if (path === "firebase" && m === "POST") return await firebaseLogin(request, env);
    if (path === "wa/start" && m === "POST") return await waStart(request, env);
    if (path === "wa/poll" && m === "POST") return await waPoll(request, env);
    if (path === "otp/send" && m === "POST") return await otpSend(request, env);
    if (path === "otp/verify" && m === "POST") return await otpVerify(request, env);
    // offline test world only (XRAY_TEST_MODE is never set on the live site): sign in as any email, optionally on a plan
    if (path === "test-login" && m === "POST" && env.XRAY_TEST_MODE === "1") { const b = await request.json().catch(() => ({})), email = cleanEmail(b.email); if (!email) return json({ ok: false }, 400);
      let tu = await userByEmail(env, email) || await createUser(env, { email, name: b.name || "" }); if (b.plan && PLANS[b.plan] && b.plan !== "free") { await grantPlan(env, tu.id, b.plan, "test:" + randId(8)); tu = await userByEmail(env, email); } return signIn(env, request, tu); }
    const u = await sessionUser(env, request);
    if (path === "logout" && m === "POST") return json({ ok: true }, 200, { "set-cookie": await endSession(env, request) });
    if (!u) return json({ ok: false, login: true, reason: "Please log in." }, 401);
    const b = await billingUser(env, u), body = m === "POST" ? await request.json().catch(() => ({})) : null;
    if (path === "profile" && m === "POST") return await profile(env, u, body);
    if (path === "history" && m === "GET") return await history(env, u, b, new URL(request.url).searchParams);
    if (path === "ledger" && m === "GET") { const r = await (await db(env)).prepare("SELECT kind, delta, note, created_at FROM acct_ledger WHERE user_id=?1 ORDER BY id DESC LIMIT 100").bind(b.id).all(); return json({ ok: true, items: r.results || [] }); }
    if (path === "checkout" && m === "POST") { const r = await checkout(request, env, u, b, body); if (r.status === 200) await logEvent(env, u.id, "checkout", (body.kind || "") + ":" + (body.item || "")); return r; }
    // v15: the page reports feature use that happens in the browser (downloads, copies) — only known kinds, rate-limited
    if (path === "event" && m === "POST") { const k = String(body.kind || ""); if (EVENT_KINDS.indexOf(k) < 0 || /^(login|paid|admin|xray_|checkout|blocked|limit)/.test(k)) return json({ ok: false }, 400);
      if (await count(env, "ev:" + u.id + ":" + Math.floor(Date.now() / 3600e3), 300, 3700)) return json({ ok: false }, 429); await logEvent(env, u.id, k, clean(body.detail, 200)); return json({ ok: true }); }
    if (path === "verify" && m === "POST") return await verify(env, b, body);
    if (path === "cancel" && m === "POST") return await cancel(env, b);
    if (path === "team") return await team(env, u, b, m, body);
    if (path === "clients") return await clients(env, b, m, body);
    if (path === "brand" && m === "POST") return await brand(env, b, body);
    return json({ ok: false, reason: "Not found." }, 404);
  } catch (e) {
    log({ route: "account/" + path, ok: false, err: String(e && e.message || e).slice(0, 200) });
    return json({ ok: false, reason: e && e.status ? "The payment service said: " + clean(e.message, 160) : "The account service hit an error. Please try again." }, e && e.status ? 502 : 500);
  }
}

function config(env) {
  const on = accountsOn(env), P = providers(env);
  const fbp = String(env.FIREBASE_PROVIDERS || "facebook,phone,microsoft,email").split(",").map((x) => x.trim()).filter((x) => /^(facebook|phone|microsoft|apple|email|github|x)$/.test(x));
  return json(Object.assign({ ok: true, enabled: on, google: on && env.GOOGLE_CLIENT_ID ? env.GOOGLE_CLIENT_ID : "",
    whatsapp: on && waOn(env),
    firebase: on && firebaseOn(env) ? { apiKey: env.FIREBASE_API_KEY, authDomain: env.FIREBASE_AUTH_DOMAIN || env.FIREBASE_PROJECT_ID + ".firebaseapp.com", projectId: env.FIREBASE_PROJECT_ID, providers: fbp } : null, email: on && !!env.RESEND_API_KEY, payments: on && cfOn(env),
    autoRenew: on && cfOn(env) && env.CASHFREE_SUBSCRIPTIONS === "1", mode: env.CASHFREE_ENV === "production" ? "production" : "sandbox", testMode: env.XRAY_TEST_MODE === "1" },
    publicPlans({ seo: !!P.seo, authority: !!env.OPR_API_KEY })), 200, { "cache-control": "public, max-age=60" });
}

/* ---------------- login ---------------- */
async function signIn(env, request, u, how) {
  if (u.blocked && !isOwner(u)) { await logEvent(env, u.id, "blocked_try", how || ""); return json({ ok: false, blocked: true, reason: "This account has been blocked. Contact anmol@fodo.co.in if you think this is a mistake." }, 403); }
  if (how) await logEvent(env, u.id, how, ""); const cookie = await newSession(env, request, u.id); return json({ ok: true, user: publicUser(u, await billingUser(env, u)) }, 200, { "set-cookie": cookie }); }
/* ---------- v16.1 free mobile-number login with WhatsApp ("reverse OTP") ----------
   1) the page asks for a code  2) the visitor sends "FODO LOGIN <code>" to FODO's WhatsApp number (one tap on the phone, QR on a computer)
   3) Meta's WhatsApp Cloud API calls our webhook with the sender's number — WhatsApp has already verified it — and the message is free
   4) the page (which holds a secret poll token) is logged in. Needs WA_NUMBER, WA_PHONE_ID, WA_TOKEN, WA_APP_SECRET, WA_VERIFY_TOKEN. */
const WA_ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
async function waStart(request, env) {
  if (!waOn(env)) return json({ ok: false, reason: "WhatsApp login is not set up yet." }, 503);
  if (await count(env, "wastart:" + await ipHash(request), 20, 3600)) return json({ ok: false, reason: "Too many tries. Try again later." }, 429);
  const d = await db(env), code = randId(6, WA_ALPHA), poll = randId(40), now = Date.now();
  await d.prepare("INSERT INTO acct_wa (code, poll_hash, created, expires) VALUES (?1,?2,?3,?4)").bind(code, await sha256(poll), now, now + 10 * 60e3).run();
  if (Math.random() < 0.1) await d.prepare("DELETE FROM acct_wa WHERE expires < ?1").bind(now - 864e5).run();
  const text = "FODO LOGIN " + code + " — please log me in to fodo.co.in";
  return json({ ok: true, code, poll, link: "https://wa.me/" + String(env.WA_NUMBER).replace(/\D/g, "") + "?text=" + encodeURIComponent(text), expires: now + 10 * 60e3 });
}
async function waPoll(request, env) {
  if (!waOn(env)) return json({ ok: false }, 503);
  const b = await request.json().catch(() => ({})), d = await db(env);
  const r = await d.prepare("SELECT * FROM acct_wa WHERE poll_hash=?1").bind(await sha256(String(b.poll || ""))).first();
  if (!r || r.expires < Date.now()) return json({ ok: false, expired: true, reason: "This login code has expired. Start again." }, 410);
  if (!r.phone) return json({ ok: true, waiting: true });
  const claim = await d.prepare("UPDATE acct_wa SET used=1 WHERE code=?1 AND used=0").bind(r.code).run();
  if (!claim.meta || !claim.meta.changes) return json({ ok: false, reason: "This code was already used." }, 409);
  const full = r.phone, last10 = full.slice(-10);
  let u = await d.prepare("SELECT * FROM acct_users WHERE wa_phone=?1").bind(full).first();
  if (!u) { if (await count(env, "signup:" + await ipHash(request), 30, 86400)) return json({ ok: false, reason: "Too many new accounts from this network today." }, 429);
    u = await createUser(env, { email: null, name: "" }); }
  await d.prepare("UPDATE acct_users SET wa_phone=?2, login_via='whatsapp', phone=COALESCE(NULLIF(phone,''), ?3) WHERE id=?1").bind(u.id, full, /^91/.test(full) ? last10 : "+" + full).run();
  u = await d.prepare("SELECT * FROM acct_users WHERE id=?1").bind(u.id).first();
  return signIn(env, request, u, "login_whatsapp");
}
async function waWebhook(request, env, m) {
  const url = new URL(request.url);
  if (m === "GET") return url.searchParams.get("hub.mode") === "subscribe" && env.WA_VERIFY_TOKEN && url.searchParams.get("hub.verify_token") === env.WA_VERIFY_TOKEN ? new Response(url.searchParams.get("hub.challenge") || "", { status: 200 }) : new Response("forbidden", { status: 403 });
  if (!waOn(env)) return json({ ok: false }, 503);
  const raw = await request.text(), sig = (request.headers.get("x-hub-signature-256") || "").replace(/^sha256=/, "");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.WA_APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)))].map((x) => x.toString(16).padStart(2, "0")).join("");
  let diff = mac.length === sig.length ? 0 : 1; for (let i = 0; i < mac.length && i < sig.length; i++) diff |= mac.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff) return json({ ok: false, reason: "bad signature" }, 401);
  let body = {}; try { body = JSON.parse(raw); } catch (e) {}
  const d = await db(env), msgs = [];
  (body.entry || []).forEach((e) => (e.changes || []).forEach((c) => ((c.value && c.value.messages) || []).forEach((x) => msgs.push(x))));
  for (const x of msgs) {
    const from = String(x.from || "").replace(/\D/g, ""), txt = String((x.text && x.text.body) || (x.button && x.button.text) || ""), mm = /FODO\s*LOGIN\s*([A-Z2-9]{6})/i.exec(txt);
    if (!from || !mm) continue;
    const upd = await d.prepare("UPDATE acct_wa SET phone=?2 WHERE code=?1 AND phone IS NULL AND expires > ?3").bind(mm[1].toUpperCase(), from, Date.now()).run();
    const ok = upd.meta && upd.meta.changes;
    try { await outbound(env)("https://graph.facebook.com/v21.0/" + env.WA_PHONE_ID + "/messages", { method: "POST", headers: { authorization: "Bearer " + env.WA_TOKEN, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: from, type: "text", text: { body: ok ? "✅ Done — go back to fodo.co.in, you are logged in. If you did not just try to log in, ignore this message." : "This login code has expired or was already used. Start again on fodo.co.in." } }), signal: AbortSignal.timeout(8000) }); } catch (e) {}
  }
  return json({ ok: true });
}
/* v16: Facebook, phone OTP, Microsoft, Apple, email link … through Firebase Authentication */
const FB_KIND = { "facebook.com": "login_facebook", phone: "login_phone", "microsoft.com": "login_microsoft", "apple.com": "login_apple", password: "login_email_link", emailLink: "login_email_link", "github.com": "login_github", "twitter.com": "login_x" };
async function firebaseLogin(request, env) {
  if (!firebaseOn(env)) return json({ ok: false, reason: "These login options are not set up yet." }, 503);
  if (await count(env, "fblogin:" + await ipHash(request), 40, 3600)) return json({ ok: false, reason: "Too many attempts. Try again later." }, 429);
  const b = await request.json().catch(() => ({}));
  let f; try { f = await verifyFirebase(env, b.idToken); } catch (e) { return json({ ok: false, reason: "Login could not be verified (" + e.message + ")." }, 401); }
  const d = await db(env), last10 = f.phone.replace(/\D/g, "").slice(-10);
  let u = await d.prepare("SELECT * FROM acct_users WHERE fb_uid=?1").bind(f.uid).first();
  if (!u && f.email) { const byMail = await userByEmail(env, f.email);
    if (byMail && !f.emailVerified) return json({ ok: false, reason: "An account with " + f.email + " already exists. Log in once with Google or the email code to use it." }, 409);
    if (byMail) u = byMail; }
  // no linking by phone number: the number on a profile is typed in, not verified, so it can't prove who owns an account
  if (!u) {
    if (await count(env, "signup:" + await ipHash(request), 30, 86400)) return json({ ok: false, reason: "Too many new accounts from this network today." }, 429);
    u = await createUser(env, { email: f.email && f.emailVerified ? f.email : null, name: f.name, picture: f.picture });
  }
  await d.prepare("UPDATE acct_users SET fb_uid=?2, login_via=?3, phone=COALESCE(NULLIF(phone,''), NULLIF(?4,'')), name=COALESCE(NULLIF(name,''), NULLIF(?5,'')), picture=COALESCE(NULLIF(picture,''), NULLIF(?6,'')) WHERE id=?1")
    .bind(u.id, f.uid, f.provider, /^\+91/.test(f.phone) ? last10 : f.phone, f.name, f.picture).run();
  u = await d.prepare("SELECT * FROM acct_users WHERE id=?1").bind(u.id).first();
  return signIn(env, request, u, FB_KIND[f.provider] || "login_other");
}
async function google(request, env) {
  if (!env.GOOGLE_CLIENT_ID) return json({ ok: false, reason: "Google sign-in is not set up." }, 503);
  if (await count(env, "glogin:" + await ipHash(request), 30, 3600)) return json({ ok: false, reason: "Too many attempts. Try again later." }, 429);
  const b = await request.json().catch(() => ({}));
  let g; try { g = await verifyGoogle(env, b.credential); } catch (e) { return json({ ok: false, reason: "Google sign-in could not be verified (" + e.message + ")." }, 401); }
  const d = await db(env);
  let u = await d.prepare("SELECT * FROM acct_users WHERE google_sub=?1").bind(g.sub).first();
  if (!u && g.email) {
    const byMail = await userByEmail(env, g.email);
    if (byMail) {
      if (!g.authoritative) return json({ ok: false, reason: "An account with this email already exists. Log in with the email code once to link Google." }, 409);
      await d.prepare("UPDATE acct_users SET google_sub=?2, name=COALESCE(NULLIF(name,''),?3), picture=?4 WHERE id=?1").bind(byMail.id, g.sub, g.name, g.picture).run();
      u = await d.prepare("SELECT * FROM acct_users WHERE id=?1").bind(byMail.id).first();
    }
  }
  if (!u && g.email && !g.authoritative && OWNER_EMAILS.indexOf(String(g.email).toLowerCase()) > -1) return json({ ok: false, reason: "For this address, log in with the email code." }, 409);
  if (!u) {
    if (!g.email) return json({ ok: false, reason: "Your Google account did not share an email address." }, 400);
    if (await count(env, "signup:" + await ipHash(request), 30, 86400)) return json({ ok: false, reason: "Too many new accounts from this network today." }, 429);
    u = await createUser(env, { email: g.email, name: g.name, picture: g.picture, google_sub: g.sub });
  }
  return signIn(env, request, u, "login_google");
}
async function otpSend(request, env) {
  if (!env.RESEND_API_KEY) return json({ ok: false, reason: "Email login is not set up." }, 503);
  const b = await request.json().catch(() => ({})), email = cleanEmail(b.email); if (!email) return json({ ok: false, reason: "Enter a valid email address." }, 400);
  const ip = await ipHash(request);
  if (await count(env, "otpip:" + ip, 30, 3600) || await count(env, "otpmail:" + email, 5, 3600)) return json({ ok: false, reason: "Too many codes requested. Try again in an hour." }, 429);
  const d = await db(env), prev = await d.prepare("SELECT sent_at FROM acct_otps WHERE email=?1").bind(email).first();
  if (prev && Date.now() - prev.sent_at < 60e3) return json({ ok: false, reason: "Please wait a minute before asking for another code." }, 429);
  const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  await d.prepare("INSERT INTO acct_otps (email, code_hash, expires_at, tries, sent_at) VALUES (?1,?2,?3,0,?4) ON CONFLICT(email) DO UPDATE SET code_hash=?2, expires_at=?3, tries=0, sent_at=?4").bind(email, await otpHash(env, email, code), Date.now() + 10 * 60e3, Date.now()).run();
  await sendMail(env, email, "Your FODO login code: " + code,
    `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111"><p>Your FODO Growth Lab login code is</p><p style="font-size:30px;font-weight:700;letter-spacing:6px">${code}</p><p>It works for 10 minutes. If you did not ask for it, ignore this email.</p><p style="color:#777">FODO — Fear Of Digitally Out ?</p></div>`,
    "Your FODO Growth Lab login code is " + code + ". It works for 10 minutes.");
  return json({ ok: true, sent: true });
}
async function otpVerify(request, env) {
  const b = await request.json().catch(() => ({})), email = cleanEmail(b.email), code = String(b.code || "").replace(/\D/g, "");
  if (!email || code.length !== 6) return json({ ok: false, reason: "Enter the 6-digit code." }, 400);
  const d = await db(env), o = await d.prepare("SELECT * FROM acct_otps WHERE email=?1").bind(email).first();
  if (!o || o.expires_at < Date.now()) return json({ ok: false, reason: "This code has expired. Ask for a new one." }, 401);
  if (o.tries >= 5) return json({ ok: false, reason: "Too many wrong tries. Ask for a new code." }, 429);
  if (o.code_hash !== await otpHash(env, email, code)) { await d.prepare("UPDATE acct_otps SET tries = tries + 1 WHERE email=?1").bind(email).run(); return json({ ok: false, reason: "That code is not right." }, 401); }
  await d.prepare("DELETE FROM acct_otps WHERE email=?1").bind(email).run();
  let u = await userByEmail(env, email);
  if (!u) { if (await count(env, "signup:" + await ipHash(request), 30, 86400)) return json({ ok: false, reason: "Too many new accounts from this network today." }, 429); u = await createUser(env, { email }); }
  return signIn(env, request, u, "login_email");
}
async function profile(env, u, b) {
  const name = clean(b.name, 80), phone = String(b.phone || "").replace(/[^\d+]/g, "");
  if (phone && !/^(\+91)?[6-9]\d{9}$/.test(phone)) return json({ ok: false, reason: "Enter a 10-digit Indian mobile number." }, 400);
  await (await db(env)).prepare("UPDATE acct_users SET name=COALESCE(NULLIF(?2,''),name), phone=COALESCE(NULLIF(?3,''),phone) WHERE id=?1").bind(u.id, name, phone.slice(-10)).run();
  return json({ ok: true });
}

/* ---------------- history ---------------- */
async function history(env, u, b, q) {
  if (!has(activePlan(b), "history")) return json({ ok: false, upgrade: "starter", reason: "Saved history is part of Starter and above." }, 402);
  const d = await db(env), client = clean(q.get("client"), 40), domain = clean(q.get("domain"), 120);
  let sql = "SELECT job_id, domain, url, tier, client_id, score, status, created_at, user_id FROM acct_runs WHERE owner_id=?1", args = [b.id];
  if (client) { sql += " AND client_id=?" + (args.length + 1); args.push(client); }
  if (domain) { sql += " AND domain=?" + (args.length + 1); args.push(domain); }
  const r = await d.prepare(sql + " ORDER BY created_at DESC LIMIT 200").bind(...args).all();
  return json({ ok: true, items: r.results || [] });
}

/* ---------------- payments ---------------- */
const istPlus = (days) => { const t = new Date(Date.now() + days * 864e5 + 5.5 * 3600e3); return t.toISOString().slice(0, 19) + "+05:30"; };
async function checkout(request, env, u, b, body) {
  if (!cfOn(env)) return json({ ok: false, reason: "Payments are not switched on yet." }, 503);
  if (b.id !== u.id) return json({ ok: false, reason: "Your team owner manages payments for this plan." }, 403);
  if (isOwner(b)) return json({ ok: false, reason: "This is a FODO owner login — every feature is already free." }, 409);
  const kind = body.kind === "pack" ? "pack" : "plan", item = String(body.item || "");
  const thing = kind === "pack" ? PACKS[item] : PLANS[item];
  if (!thing || (kind === "plan" && item === "free")) return json({ ok: false, reason: "Unknown plan." }, 400);
  const cur = activePlan(b);
  if (kind === "plan" && rank(item) < rank(cur)) return json({ ok: false, reason: "Your " + PLANS[cur].name + " plan is active until " + b.plan_until.slice(0, 10) + ". You can switch to a smaller plan after that." }, 409);
  const phone = String(body.phone || b.phone || "").replace(/\D/g, "").slice(-10);
  if (!/^[6-9]\d{9}$/.test(phone)) return json({ ok: false, needPhone: true, reason: "Enter your 10-digit mobile number (the payment page needs it)." }, 400);
  if (phone !== b.phone) await (await db(env)).prepare("UPDATE acct_users SET phone=?2 WHERE id=?1").bind(b.id, phone).run();
  if (await count(env, "checkout:" + b.id, 20, 3600)) return json({ ok: false, reason: "Too many payment attempts. Try again later." }, 429);
  const d = await db(env), site = SITE(request), cust = { customer_id: b.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 50), customer_email: b.email, customer_phone: phone, customer_name: (b.name || b.email.split("@")[0]).slice(0, 100).padEnd(3, ".") };
  if (kind === "plan" && body.autoRenew && env.CASHFREE_SUBSCRIPTIONS === "1") {
    const sid = "fs_" + randId(20);
    const s = await cf(env, "POST", "/subscriptions", { subscription_id: sid, customer_details: { customer_name: cust.customer_name, customer_email: cust.customer_email, customer_phone: phone },
      plan_details: { plan_name: ("FODO " + thing.name + " monthly").slice(0, 40), plan_type: "PERIODIC", plan_amount: thing.price, plan_max_amount: thing.price, plan_max_cycles: 120, plan_intervals: 1, plan_interval_type: "MONTH", plan_currency: "INR", plan_note: "FODO Growth Lab " + thing.name },
      authorization_details: { authorization_amount: thing.price, authorization_amount_refund: false, payment_methods: ["upi", "card", "enach"] },
      subscription_meta: { return_url: site + "/account/?subscription_id=" + sid }, subscription_first_charge_time: istPlus(30), subscription_expiry_time: istPlus(3650),
      subscription_tags: { plan: item, user: b.id.slice(0, 40) } }, sid);
    await d.prepare("INSERT INTO acct_subs (subscription_id, user_id, plan, amount, status, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?6)").bind(sid, b.id, item, thing.price, s.subscription_status || "INITIALIZED", nowIso()).run();
    return json({ ok: true, subsSessionId: s.subscription_session_id, subscriptionId: sid, mode: env.CASHFREE_ENV === "production" ? "production" : "sandbox" });
  }
  const oid = "fo_" + randId(20);
  const o = await cf(env, "POST", "/orders", { order_id: oid, order_amount: thing.price, order_currency: "INR", customer_details: cust,
    order_meta: { return_url: site + "/account/?order_id=" + oid, notify_url: site + "/api/account/webhook/cashfree" }, order_note: ("FODO Growth Lab " + (kind === "pack" ? thing.name + " pack" : thing.name + " — 1 month")).slice(0, 200),
    order_tags: { kind, item, user: b.id.slice(0, 40) } }, oid);
  await d.prepare("INSERT INTO acct_orders (order_id, user_id, kind, item, amount, status, cf_order_id, created_at) VALUES (?1,?2,?3,?4,?5,'ACTIVE',?6,?7)").bind(oid, b.id, kind, item, thing.price, String(o.cf_order_id || ""), nowIso()).run();
  return json({ ok: true, paymentSessionId: o.payment_session_id, orderId: oid, mode: env.CASHFREE_ENV === "production" ? "production" : "sandbox" });
}
/* subscription: ACTIVE → first month; each later successful charge → one more month (idempotent by Cashfree payment id) */
async function settleSub(env, sid, payment) {
  const d = await db(env), s = await d.prepare("SELECT * FROM acct_subs WHERE subscription_id=?1").bind(sid).first(); if (!s) return { ok: false, reason: "unknown subscription" };
  const cs = await cf(env, "GET", "/subscriptions/" + encodeURIComponent(sid)), st = cs.subscription_status || "";
  await d.prepare("UPDATE acct_subs SET status=?2, updated_at=?3 WHERE subscription_id=?1").bind(sid, st, nowIso()).run();
  if (st !== "ACTIVE") return { ok: false, status: st };
  let granted = await grantPlan(env, s.user_id, s.plan, "sub:" + sid + ":first", PLANS[s.plan].name + " — first month (auto-renew)");
  if (payment && payment.cf_payment_id && payment.payment_status === "SUCCESS" && payment.payment_type !== "AUTH" && Math.abs(+payment.payment_amount - s.amount) < 0.01)
    granted = (await grantPlan(env, s.user_id, s.plan, "subpay:" + payment.cf_payment_id, PLANS[s.plan].name + " — renewed")) || granted;
  return { ok: true, status: st, granted };
}
async function verify(env, b, body) {
  if (!cfOn(env)) return json({ ok: false, reason: "Payments are not switched on." }, 503);
  const d = await db(env);
  if (body.order_id) {
    const o = await d.prepare("SELECT user_id FROM acct_orders WHERE order_id=?1").bind(String(body.order_id)).first();
    if (!o || o.user_id !== b.id) return json({ ok: false, reason: "Order not found." }, 404);
    const r = await settleOrder(env, String(body.order_id)); return json(Object.assign({ ok: r.ok, paid: r.ok, status: r.status || (r.ok ? "PAID" : "") }, r.reason ? { reason: r.reason } : {}));
  }
  if (body.subscription_id) {
    const s = await d.prepare("SELECT user_id FROM acct_subs WHERE subscription_id=?1").bind(String(body.subscription_id)).first();
    if (!s || s.user_id !== b.id) return json({ ok: false, reason: "Subscription not found." }, 404);
    const r = await settleSub(env, String(body.subscription_id)); return json({ ok: r.ok, active: r.ok, status: r.status || "" });
  }
  return json({ ok: false, reason: "Nothing to verify." }, 400);
}
async function cancel(env, b) {
  const d = await db(env), s = await d.prepare("SELECT * FROM acct_subs WHERE user_id=?1 AND status='ACTIVE' ORDER BY created_at DESC").bind(b.id).first();
  if (!s) return json({ ok: false, reason: "No auto-renewing plan to cancel." }, 404);
  await cf(env, "POST", "/subscriptions/" + encodeURIComponent(s.subscription_id) + "/manage", { subscription_id: s.subscription_id, action: "CANCEL" });
  await d.prepare("UPDATE acct_subs SET status='CANCELLED', updated_at=?2 WHERE subscription_id=?1").bind(s.subscription_id, nowIso()).run();
  return json({ ok: true, until: b.plan_until });
}
async function webhook(request, env) {
  const raw = await request.text();
  if (!cfOn(env) || !(await verifyWebhook(env, request.headers.get("x-webhook-timestamp"), raw, request.headers.get("x-webhook-signature")))) { log({ route: "webhook", ok: false, err: "signature" }); return json({ ok: false }, 401); }
  let j = {}; try { j = JSON.parse(raw); } catch (e) { return json({ ok: false }, 400); }
  const t = String(j.type || ""), dt = j.data || {};
  let r = { ok: true, ignored: true };
  if (dt.order && dt.order.order_id && /^fo_/.test(dt.order.order_id)) r = await settleOrder(env, dt.order.order_id);
  else if (/^SUBSCRIPTION_/.test(t)) { const sid = dt.subscription_id || (dt.subscription_details || {}).subscription_id; if (sid && /^fs_/.test(sid)) r = await settleSub(env, sid, /PAYMENT_SUCCESS/.test(t) ? dt : null); }
  log({ route: "webhook", type: t, ok: !!r.ok });
  return json({ ok: true });
}

/* ---------------- agency: team, clients, white-label ---------------- */
async function team(env, u, b, m, body) {
  const d = await db(env);
  if (m === "GET") { const r = await d.prepare("SELECT email, added_at FROM acct_team WHERE owner_id=?1 ORDER BY added_at").bind(b.id).all(); return json({ ok: true, owner: b.email, members: r.results || [], seats: PLANS[activePlan(b)].seats }); }
  if (b.id !== u.id) return json({ ok: false, reason: "Only the plan owner can change the team." }, 403);
  if (!has(activePlan(b), "team")) return json({ ok: false, upgrade: "agency", reason: "Teams are part of the Agency plan." }, 402);
  const email = cleanEmail(body.email); if (!email || email === b.email) return json({ ok: false, reason: "Enter a team member's email." }, 400);
  if (body.remove) { await d.prepare("DELETE FROM acct_team WHERE owner_id=?1 AND email=?2").bind(b.id, email).run(); return json({ ok: true }); }
  const n = await d.prepare("SELECT count(*) n FROM acct_team WHERE owner_id=?1").bind(b.id).first();
  if (n.n + 1 >= PLANS.agency.seats) return json({ ok: false, reason: "All " + PLANS.agency.seats + " seats are in use." }, 409);
  const other = await d.prepare("SELECT owner_id FROM acct_team WHERE email=?1").bind(email).first(); if (other) return json({ ok: false, reason: "That person is already in a team." }, 409);
  await d.prepare("INSERT INTO acct_team (owner_id, email, added_at) VALUES (?1,?2,?3)").bind(b.id, email, nowIso()).run();
  return json({ ok: true });
}
async function clients(env, b, m, body) {
  const d = await db(env);
  if (m === "GET") { const r = await d.prepare("SELECT id, name, created_at FROM acct_clients WHERE owner_id=?1 ORDER BY name").bind(b.id).all(); return json({ ok: true, items: r.results || [] }); }
  if (!has(activePlan(b), "clients")) return json({ ok: false, upgrade: "agency", reason: "Client folders are part of the Agency plan." }, 402);
  if (body.remove) { await d.prepare("DELETE FROM acct_clients WHERE owner_id=?1 AND id=?2").bind(b.id, String(body.remove)).run(); return json({ ok: true }); }
  const name = clean(body.name, 60); if (!name) return json({ ok: false, reason: "Enter a client name." }, 400);
  const id = "c_" + randId(12); await d.prepare("INSERT INTO acct_clients (id, owner_id, name, created_at) VALUES (?1,?2,?3,?4)").bind(id, b.id, name, nowIso()).run();
  return json({ ok: true, id, name });
}
async function brand(env, b, body) {
  if (!has(activePlan(b), "whiteLabel")) return json({ ok: false, upgrade: "agency", reason: "White-label reports are part of the Agency plan." }, 402);
  const name = clean(body.name, 60), color = /^#[0-9a-f]{6}$/i.test(body.color || "") ? body.color : "#4C3BCF", logo = String(body.logo || "");
  if (logo && (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(logo) || logo.length > 200000)) return json({ ok: false, reason: "Logo must be a JPEG under 150 KB." }, 400);
  await (await db(env)).prepare("UPDATE acct_users SET brand=?2 WHERE id=?1").bind(b.id, JSON.stringify({ name, color, logo })).run();
  return json({ ok: true });
}
export { refundCredit };
