/* FODO v53.5: fodo.co.in/studio/key/#FODO-XXXX-...: the "Copy key" button from the key email.
   The key is only in the # part of the link (never sent to a server); it is read here, shown, removed from the
   address bar and history, and copied with one tap. */
(function () {
  "use strict";
  var raw = "", el = function (id) { return document.getElementById(id); };
  try { raw = decodeURIComponent(location.hash.replace(/^#/, "")); } catch (e) { raw = ""; }
  var c = raw.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^FODO/, ""), key = c.length === 20 ? "FODO-" + c.match(/.{4}/g).join("-") : "";
  try { if (location.hash) history.replaceState(null, "", location.pathname); } catch (e) {}
  var box = el("kc-key"), b = el("kc-copy"), msg = el("kc-msg");
  if (!key) { el("kc-h").textContent = "No key in this link"; el("kc-sub").textContent = "Open the Copy key button from your FODO Studio email again, or copy the key from the email by hand."; box.textContent = "FODO-XXXX-XXXX-XXXX-XXXX-XXXX"; b.hidden = true; return; }
  box.textContent = key;
  var select = function () { try { var r = document.createRange(); r.selectNodeContents(box); var s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {} };
  var done = function (ok) { msg.textContent = ok ? "Copied. Paste it into FODO Studio." : "Selected: press Ctrl+C (Cmd+C on Mac) to copy."; msg.className = "fs-kmsg" + (ok ? " ok" : ""); b.textContent = ok ? "Copied" : "Copy key"; };
  b.addEventListener("click", function () {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(key).then(function () { done(true); }, function () { select(); done(false); });
    else { select(); var ok = false; try { ok = document.execCommand("copy"); } catch (e) {} done(ok); }
  });
  box.addEventListener("click", select); box.addEventListener("focus", select);
})();
