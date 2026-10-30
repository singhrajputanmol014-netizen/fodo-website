/* FODO Growth Lab accounts — login (Google or a 6-digit email code), plan & credits, Cashfree checkout.
   Talks only to /api/account/* (the server holds every secret; this file never sees a key).
   window.FODO_ACCOUNT = { config, me, login, logout, api, checkout, history, report, onChange, plans }
   When the server says accounts are off (ACCOUNTS_ENABLED not set), everything here stays quiet and the tools run as before. */
(function () {
  "use strict";
  var U = window.FODO_UTIL || {}, ROOT = U.root || (document.querySelector('meta[name="fodo-root"]') || {}).content || "/";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var inr = function (n) { return "₹" + Number(n).toLocaleString("en-IN"); };
  var cfgP = null, meP = null, user, subs = [];
  var api = function (path, body) {
    // v17.1.3: a request that never answers must not leave the page on "Loading…" — give up after 15 s and say so
    var ac = typeof AbortController === "function" ? new AbortController() : null, tm = ac ? setTimeout(function () { ac.abort(); }, 15000) : 0;
    return fetch(ROOT + "api/account/" + path, { method: body === undefined ? "GET" : "POST", credentials: "same-origin", headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: ac ? ac.signal : undefined })
      .then(function (r) { clearTimeout(tm); return r.json().catch(function () { return { ok: false, reason: "The account service did not answer (" + r.status + ").", _bad: true }; }).then(function (j) { j._status = r.status; return j; }); },
        function (e) { clearTimeout(tm); return e && e.name === "AbortError" ? { ok: false, reason: "The account service is not answering right now (waited 15 s).", _status: 0, _bad: true } : { ok: false, reason: "No connection. Check your internet and try again.", _status: 0, _bad: true }; });
  };
  var config = function () { return cfgP = cfgP || api("config").then(function (j) {
    if (j.ok) return j;
    if (j._bad || j._status >= 500 && !j.disabled) { cfgP = null; return { enabled: false, unreachable: j.reason || "The account service is not answering right now.", plans: [], packs: [] }; }   // a server problem is not "accounts off"
    return { enabled: false, plans: [], packs: [] }; }); };
  var known = false, set = function (u) { user = u || null; known = true; subs.forEach(function (f) { try { f(user); } catch (e) {} }); chip(); return user; };
  var me = function (force) { if (force || !meP) meP = config().then(function (c) { return c.enabled ? api("me").then(function (j) { return set(j.user); }) : set(null); }); return meP; };
  var load = function (src, test) { return new Promise(function (ok, no) { if (test()) return ok(); var s = document.createElement("script"); s.src = src; s.async = true; s.onload = function () { ok(); }; s.onerror = function () { no(new Error("Could not load " + src.split("/")[2])); }; document.head.appendChild(s); }); };

  /* ---------- dialog ---------- */
  var dlg;
  function box(html, label) {
    close();
    dlg = document.createElement("div"); dlg.className = "cfx acct-dlg"; dlg.innerHTML = '<div class="cfx-back" data-acx></div><div class="cfx-box" role="dialog" aria-modal="true" aria-label="' + esc(label) + '"><button type="button" class="cfx-close" data-acx aria-label="Close">×</button>' + html + "</div>";
    document.body.appendChild(dlg); document.documentElement.classList.add("cfx-open");
    dlg.addEventListener("click", function (e) { if (e.target.closest("[data-acx]")) { close(); if (dlg && dlg._cancel) dlg._cancel(); } });
    var f = dlg.querySelector("input,button:not(.cfx-close)"); if (f) setTimeout(function () { f.focus(); }, 30);
    return dlg;
  }
  function close() { var d = document.querySelector(".acct-dlg"); if (d) { var c = d._cancel; d.remove(); document.documentElement.classList.remove("cfx-open"); dlg = null; if (c) c(); } }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && document.querySelector(".acct-dlg")) close(); });
  var msg = function (el, t, kind) { el.textContent = t || ""; el.className = "cf-status" + (kind ? " " + kind : ""); };

  /* ---------- login ---------- */
  var pending = null;
  function login(reason) {
    if (pending) return pending;
    return pending = config().then(function (c) {
      if (!c.enabled) return Promise.reject(new Error("Accounts are not switched on yet."));
      return new Promise(function (resolve, reject) {
        var d = box('<p class="eyebrow">FODO GROWTH LAB</p><h3 style="margin:6px 0 4px">Log in to continue</h3><p class="muted" style="margin:0 0 16px">' + esc(reason || "Your first " + ((c.plans[0] || {}).xrays || 2) + " Business X-Rays are free. No card needed.") + "</p>" +
          (c.google ? '<div id="acct-g" class="acct-g"></div>' + (c.email || c.firebase || c.whatsapp ? '<p class="acct-or"><span>or</span></p>' : "") : "") +
          (c.email ? '<form id="acct-f" class="acct-f" novalidate><label for="acct-email">Email</label><input id="acct-email" type="email" autocomplete="email" inputmode="email" placeholder="you@company.com" maxlength="120" required><div id="acct-codebox" hidden><label for="acct-code">6-digit code from your email</label><input id="acct-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="\\d{6}"></div><button class="btn" type="submit" id="acct-go">Email me a code</button></form>' : "") +
          waBlock(c) + fbButtons(c) +
          (!c.google && !c.email && !c.firebase && !c.whatsapp ? '<p class="cf-status warn">No login method is set up yet. Please try again later.</p>' : "") +
          (c.testMode ? '<details class="acct-test"><summary>Test login (test mode only)</summary><form id="acct-tf"><input id="acct-temail" type="email" placeholder="test@example.com"><select id="acct-tplan"><option value="">free</option>' + c.plans.slice(1).map(function (p) { return '<option value="' + p.id + '">' + p.id + "</option>"; }).join("") + '</select><button class="btn sm" type="submit">Test login</button></form></details>' : "") +
          '<p class="cf-status" id="acct-msg" role="status" aria-live="polite"></p><p class="muted acct-fine">By logging in you agree to the <a href="' + ROOT + 'legal/#terms">terms</a> and <a href="' + ROOT + 'legal/#privacy">privacy policy</a>. We only store your email or phone, name and X-Ray history.</p><div id="acct-recap"></div>', "Log in");
        var m = d.querySelector("#acct-msg"), done = function (j) { if (!j.ok) { msg(m, j.reason || "Could not log in.", "warn"); return; } meP = Promise.resolve(set(j.user)); d._cancel = null; close(); resolve(j.user); };
        d._cancel = function () { reject(Object.assign(new Error("Login cancelled"), { cancelled: true })); };
        if (c.google) load("https://accounts.google.com/gsi/client", function () { return window.google && google.accounts && google.accounts.id; }).then(function () {
          google.accounts.id.initialize({ client_id: c.google, callback: function (r) { msg(m, "Checking your Google account…", "busy"); api("google", { credential: r.credential }).then(done); }, ux_mode: "popup", auto_select: false });
          var g = d.querySelector("#acct-g"); if (g) google.accounts.id.renderButton(g, { theme: document.documentElement.getAttribute("data-theme") === "light" ? "outline" : "filled_black", size: "large", text: "continue_with", shape: "pill", width: Math.min(360, g.clientWidth || 320) });
        }, function () { var g = d.querySelector("#acct-g"); if (g) g.innerHTML = '<p class="muted">Google sign-in could not load here' + (c.email ? " — use your email below." : ".") + "</p>"; });
        var f = d.querySelector("#acct-f");
        if (f) f.addEventListener("submit", function (e) {
          e.preventDefault(); var email = d.querySelector("#acct-email").value.trim(), cb = d.querySelector("#acct-codebox"), code = d.querySelector("#acct-code").value.trim(), go = d.querySelector("#acct-go");
          if (cb.hidden) {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg(m, "Enter a valid email address.", "warn"); return; }
            go.disabled = true; msg(m, "Sending the code…", "busy");
            api("otp/send", { email: email }).then(function (j) { go.disabled = false; if (!j.ok) { msg(m, j.reason, "warn"); return; } cb.hidden = false; go.textContent = "Log in"; d.querySelector("#acct-code").focus(); msg(m, "We emailed a 6-digit code to " + email + ". It works for 10 minutes. Check spam if you don't see it.", "ok"); });
          } else {
            if (!/^\d{6}$/.test(code)) { msg(m, "Enter the 6 digits from the email.", "warn"); return; }
            go.disabled = true; msg(m, "Checking the code…", "busy"); api("otp/verify", { email: email, code: code }).then(function (j) { go.disabled = false; done(j); });
          }
        });
        fbWire(c, d, m, done); waWire(c, d, m, done);
        var tf = d.querySelector("#acct-tf"); if (tf) tf.addEventListener("submit", function (e) { e.preventDefault(); api("test-login", { email: d.querySelector("#acct-temail").value, plan: d.querySelector("#acct-tplan").value }).then(done); });
      });
    }).then(function (u) { pending = null; return u; }, function (e) { pending = null; throw e; });
  }
  /* ---------- v16: Facebook, phone OTP, Microsoft, Apple, email link — via Firebase Authentication ---------- */
  var FBV = "10.14.1", PROV = { facebook: ["Facebook", "#1877F2", "f"], microsoft: ["Microsoft", "#2F2F2F", "⊞"], apple: ["Apple", "#000", "A"], github: ["GitHub", "#24292F", "⌥"], x: ["X", "#000", "𝕏"] };
  function fbAuth(c) {
    return load("https://www.gstatic.com/firebasejs/" + FBV + "/firebase-app-compat.js", function () { return window.firebase && firebase.initializeApp; })
      .then(function () { return load("https://www.gstatic.com/firebasejs/" + FBV + "/firebase-auth-compat.js", function () { return window.firebase && firebase.auth; }); })
      .then(function () { if (!firebase.apps.length) firebase.initializeApp({ apiKey: c.firebase.apiKey, authDomain: c.firebase.authDomain, projectId: c.firebase.projectId }); var a = firebase.auth(); a.useDeviceLanguage(); return a; });
  }
  var fbHas = function (c, k) { return !!(c.firebase && c.firebase.providers.indexOf(k) > -1); };
  function fbButtons(c) {
    if (!c.firebase) return "";
    var social = ["facebook", "microsoft", "apple", "github", "x"].filter(function (k) { return fbHas(c, k); });
    return (social.length ? '<div class="acct-prov">' + social.map(function (k) { return '<button type="button" class="acct-pb" data-prov="' + k + '" style="--pc:' + PROV[k][1] + '"><span aria-hidden="true">' + PROV[k][2] + "</span>Continue with " + PROV[k][0] + "</button>"; }).join("") + "</div>" : "") +
      (fbHas(c, "phone") ? '<details class="acct-alt" id="acct-phone"><summary>Log in with your mobile number (OTP)</summary><form class="acct-f" id="acct-pf2" novalidate><label for="acct-pn">Mobile number</label><div class="acct-cc"><span>+91</span><input id="acct-pn" inputmode="tel" autocomplete="tel-national" maxlength="10" placeholder="98XXXXXXXX"></div><div id="acct-pcbox" hidden><label for="acct-pc">6-digit code from the SMS</label><input id="acct-pc" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div><button class="btn" type="submit" id="acct-pgo">Send OTP</button></form></details>' : "") +
      (!c.email && fbHas(c, "email") ? '<details class="acct-alt"><summary>Log in with email (we send a link)</summary><form class="acct-f" id="acct-lf" novalidate><label for="acct-le">Email</label><input id="acct-le" type="email" autocomplete="email" placeholder="you@company.com"><button class="btn" type="submit">Email me a login link</button></form></details>' : "");
  }
  var fbErr = function (e) { var k = (e && e.code) || ""; return k === "auth/popup-closed-by-user" || k === "auth/cancelled-popup-request" ? "" : k === "auth/account-exists-with-different-credential" ? "This email already uses another login (for example Google). Log in with that one." : k === "auth/popup-blocked" ? "The browser blocked the login window. Allow pop-ups for fodo.co.in and try again." : k === "auth/invalid-verification-code" ? "That code is not right." : k === "auth/too-many-requests" ? "Too many tries. Please wait a little and try again." : k === "auth/invalid-phone-number" ? "Enter a valid 10-digit mobile number." : k === "auth/unauthorized-domain" ? "This website is not yet allowed in Firebase (Authorized domains)." : (e && e.message) || "Could not log in."; };
  var fbFinish = function (cred, m, done) { msg(m, "Checking your login…", "busy"); return cred.user.getIdToken().then(function (t) { return api("firebase", { idToken: t }); }).then(function (j) { try { firebase.auth().signOut(); } catch (e) {} done(j); }); };
  function fbWire(c, d, m, done) {
    if (!c.firebase) return;
    d.querySelectorAll("[data-prov]").forEach(function (b) { b.onclick = function () {
      msg(m, "Opening " + PROV[b.dataset.prov][0] + "…", "busy");
      fbAuth(c).then(function (a) { var k = b.dataset.prov, p = k === "facebook" ? new firebase.auth.FacebookAuthProvider() : k === "github" ? new firebase.auth.GithubAuthProvider() : k === "x" ? new firebase.auth.TwitterAuthProvider() : new firebase.auth.OAuthProvider(k === "microsoft" ? "microsoft.com" : "apple.com");
        if (k === "facebook") p.addScope("email"); if (k === "apple" || k === "microsoft") { p.addScope("email"); if (k === "apple") p.addScope("name"); }
        return a.signInWithPopup(p).then(function (cred) { return fbFinish(cred, m, done); }); }).catch(function (e) { msg(m, fbErr(e), fbErr(e) ? "warn" : ""); });
    }; });
    var pf = d.querySelector("#acct-pf2"), conf = null, ver = null;
    if (pf) pf.addEventListener("submit", function (e) {
      e.preventDefault(); var go = d.querySelector("#acct-pgo"), n = d.querySelector("#acct-pn").value.replace(/\D/g, "").slice(-10);
      if (!conf) {
        if (!/^[6-9]\d{9}$/.test(n)) { msg(m, "Enter a 10-digit mobile number starting with 6–9.", "warn"); return; }
        go.disabled = true; msg(m, "Sending the OTP…", "busy");
        fbAuth(c).then(function (a) { ver = ver || new firebase.auth.RecaptchaVerifier("acct-recap", { size: "invisible" }); return a.signInWithPhoneNumber("+91" + n, ver); })
          .then(function (r) { conf = r; go.disabled = false; go.textContent = "Log in"; d.querySelector("#acct-pcbox").hidden = false; d.querySelector("#acct-pc").focus(); msg(m, "We sent a 6-digit code by SMS to +91 " + n + ".", "ok"); }, function (er) { go.disabled = false; msg(m, fbErr(er), "warn"); try { ver && ver.clear(); ver = null; } catch (x) {} });
      } else {
        var code = d.querySelector("#acct-pc").value.trim(); if (!/^\d{6}$/.test(code)) { msg(m, "Enter the 6 digits from the SMS.", "warn"); return; }
        go.disabled = true; conf.confirm(code).then(function (cred) { return fbFinish(cred, m, done); }, function (er) { go.disabled = false; msg(m, fbErr(er), "warn"); });
      }
    });
    var lf = d.querySelector("#acct-lf");
    if (lf) lf.addEventListener("submit", function (e) {
      e.preventDefault(); var em = d.querySelector("#acct-le").value.trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { msg(m, "Enter a valid email address.", "warn"); return; }
      msg(m, "Sending the link…", "busy");
      fbAuth(c).then(function (a) { return a.sendSignInLinkToEmail(em, { url: location.origin + "/account/?fblink=1&next=" + encodeURIComponent(location.pathname), handleCodeInApp: true }); })
        .then(function () { try { localStorage.setItem("fodo-fb-email", em); } catch (x) {} msg(m, "Check " + em + " — tap the link in the email to log in (it may be in spam).", "ok"); }, function (er) { msg(m, fbErr(er), "warn"); });
    });
  }
  /* ---------- v16.1 free mobile login: send a code to FODO on WhatsApp ---------- */
  function waBlock(c) { return c.whatsapp ? '<button type="button" class="acct-pb acct-wa" id="acct-wa" style="--pc:#25D366"><span aria-hidden="true">✆</span>Continue with WhatsApp (mobile number)</button><div id="acct-wabox" class="acct-wabox" hidden></div>' : ""; }
  function waWire(c, d, m, done) {
    var b = d.querySelector("#acct-wa"); if (!b) return;
    b.onclick = function () {
      b.disabled = true; msg(m, "Getting a login code…", "busy");
      api("wa/start", {}).then(function (j) {
        b.disabled = false; if (!j.ok) { msg(m, j.reason || "WhatsApp login is not available.", "warn"); return; }
        var box = d.querySelector("#acct-wabox"), touch = matchMedia("(pointer:coarse)").matches || innerWidth < 760; box.hidden = false; b.hidden = true;
        box.innerHTML = (touch ? '<p>Tap the button, then press <b>Send</b> in WhatsApp. Come back here — you will be logged in automatically.</p><a class="btn acct-wago" href="' + esc(j.link) + '" target="_blank" rel="noopener">Open WhatsApp &amp; send code ' + esc(j.code) + "</a>"
          : '<p>Scan with your phone camera and press <b>Send</b> in WhatsApp — or <a href="' + esc(j.link) + '" target="_blank" rel="noopener">open WhatsApp on this computer</a>.</p><div class="acct-qr" id="acct-qr" aria-label="QR code to send the login message"></div>') +
          '<p class="muted acct-fine">Your code: <b>' + esc(j.code) + "</b> · valid 10 minutes · it's free — you send the message, FODO never sends you an SMS.</p>";
        if (!touch) load("https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js", function () { return typeof window.QRCode === "function"; }).then(function () { new QRCode(d.querySelector("#acct-qr"), { text: j.link, width: 180, height: 180, correctLevel: QRCode.CorrectLevel.M }); }, function () { d.querySelector("#acct-qr").innerHTML = '<a class="btn" href="' + esc(j.link) + '" target="_blank" rel="noopener">Open WhatsApp</a>'; });
        msg(m, "Waiting for your WhatsApp message…", "busy");
        var poll = function () { if (!document.body.contains(d) || Date.now() > j.expires) { if (document.body.contains(d)) msg(m, "The code expired. Close this box and try again.", "warn"); return; }
          api("wa/poll", { poll: j.poll }).then(function (r) { if (r.waiting) return setTimeout(poll, 2500); if (r.ok) return done(r); msg(m, r.reason || "Could not log in.", "warn"); }, function () { setTimeout(poll, 4000); }); };
        setTimeout(poll, 2500);
      });
    };
  }
  /* coming back from the emailed login link */
  function fbLinkReturn() {
    if (!/[?&]fblink=1/.test(location.search)) return;
    config().then(function (c) { if (!c.firebase) return; fbAuth(c).then(function (a) {
      if (!a.isSignInWithEmailLink(location.href)) return;
      var em = ""; try { em = localStorage.getItem("fodo-fb-email") || ""; } catch (x) {}
      if (!em) em = (window.prompt("Confirm the email you asked the login link for:") || "").trim(); if (!em) return;
      return a.signInWithEmailLink(em, location.href).then(function (cred) { return cred.user.getIdToken(); }).then(function (t) { return api("firebase", { idToken: t }); }).then(function (j) {
        try { a.signOut(); localStorage.removeItem("fodo-fb-email"); } catch (x) {}
        var nx = new URLSearchParams(location.search).get("next") || ""; if (j.ok) { meP = Promise.resolve(set(j.user)); if (/^\/[a-z0-9\-\/]*$/i.test(nx) && nx !== "/account/") location.replace(nx); else history.replaceState(null, "", location.pathname); }
        else alert(j.reason || "Could not log in.");
      });
    }).catch(function (e) { alert(fbErr(e) || "Could not log in."); }); });
  }
  function logout() { return api("logout", {}).then(function () { meP = Promise.resolve(set(null)); }); }

  /* ---------- payments (Cashfree) ---------- */
  function askPhone(have) {
    return new Promise(function (resolve, reject) {
      var d = box('<h3 style="margin:0 0 6px">Mobile number</h3><p class="muted" style="margin:0 0 14px">The payment page (Cashfree) needs a 10-digit Indian mobile number for the receipt and UPI. We don\'t call or message you.</p><form id="acct-pf" class="acct-f"><label for="acct-ph">Mobile</label><input id="acct-ph" inputmode="tel" autocomplete="tel-national" maxlength="14" placeholder="98XXXXXXXX" value="' + esc(have || "") + '"><button class="btn" type="submit">Continue to payment</button></form><p class="cf-status" id="acct-pm" role="status"></p>', "Mobile number");
      d._cancel = function () { reject(Object.assign(new Error("cancelled"), { cancelled: true })); };
      d.querySelector("#acct-pf").addEventListener("submit", function (e) { e.preventDefault(); var v = d.querySelector("#acct-ph").value.replace(/\D/g, "").slice(-10); if (!/^[6-9]\d{9}$/.test(v)) { msg(d.querySelector("#acct-pm"), "Enter a 10-digit mobile number starting with 6–9.", "warn"); return; } d._cancel = null; close(); resolve(v); });
    });
  }
  function checkout(kind, item, opt) {
    opt = opt || {};
    return me().then(function (u) { return u || login("Log in to buy — your plan is linked to your account."); }).then(function (u) {
      return askPhone(u.phone).then(function (phone) {
        return api("checkout", { kind: kind, item: item, phone: phone, autoRenew: !!opt.autoRenew }).then(function (j) {
          if (!j.ok) throw Object.assign(new Error(j.reason || "Could not start the payment."), { user: true });
          return config().then(function (c) {
            return load("https://sdk.cashfree.com/js/v3/cashfree.js", function () { return typeof window.Cashfree === "function"; }).then(function () {
              var cf = window.Cashfree({ mode: j.mode || c.mode || "sandbox" });
              try { sessionStorage.setItem("fodo-pay", JSON.stringify({ kind: kind, item: item, id: j.orderId || j.subscriptionId, t: Date.now() })); } catch (e) {}
              if (j.subsSessionId) return cf.subscriptionsCheckout({ subsSessionId: j.subsSessionId, redirectTarget: "_self" });
              return cf.checkout({ paymentSessionId: j.paymentSessionId, redirectTarget: "_self" });
            });
          });
        });
      });
    });
  }

  /* ---------- header chip (pages that load this file) ---------- */
  /* header: between the menu links (… Contact) and the search icon; menu (☰): the last item */
  function chip() {
    config().then(function (cf) {
      var h = document.querySelector("#site-header .container"), dr = document.getElementById("drawer");
      [h, dr].forEach(function (host, i) {
        if (!host) return;
        var c = host.querySelector(i ? ".acct-drawer" : ".acct-chip");
        if (!cf.enabled) { if (c) c.remove(); return; }
        if (!c) { c = document.createElement("a"); c.className = i ? "acct-drawer" : "acct-chip"; if (i) host.appendChild(c); else host.insertBefore(c, host.querySelector("#search-open") || host.querySelector(".header-cta") || host.querySelector(".burger")); }
        c.href = ROOT + "account/";
        if (user) { var t = esc(user.planName) + " · " + user.credits.total + " X-Ray" + (user.credits.total === 1 ? "" : "s"); c.innerHTML = '<span class="acct-dot" aria-hidden="true">' + esc((user.name || user.email || user.phone || "U").charAt(0).toUpperCase()) + "</span><span>" + (i ? "My account · " + t : t) + "</span>"; c.setAttribute("aria-label", "Your account: " + user.planName + " plan, " + user.credits.total + " X-Rays left"); c.onclick = null; }
        else { c.innerHTML = '<span class="acct-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg></span><span>' + (i ? "Log in / Sign up — 2 free X-Rays" : "Log in") + "</span>"; c.setAttribute("aria-label", "Log in"); c.onclick = function (e) { e.preventDefault(); var d = document.getElementById("drawer"); if (d && d.classList.contains("open")) { d.classList.remove("open"); document.body.classList.remove("locked"); } login().catch(function () {}); }; }
      });
    });
  }

  window.FODO_ACCOUNT = { config: config, me: me, login: login, logout: logout, api: api, checkout: checkout, close: close, esc: esc, inr: inr,
    onChange: function (f) { subs.push(f); if (known) try { f(user); } catch (e) {} },   /* late subscribers get the current user straight away */ history: function (q) { return api("history" + (q ? "?" + new URLSearchParams(q) : "")); },
    current: function () { return user; } };
  var start = function () { me(); fbLinkReturn(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
