/* v50.8 (S6): if the account page is still "Loading" after 20 s, say why and offer a reload (formerly inline, with an inline onclick). */
(function(){setTimeout(function(){var r=document.getElementById("ac-root");if(!r||!/Loading your account/.test(r.textContent))return;
r.innerHTML='<div class="panel hud"><h2>Your account is taking too long</h2><p class="muted">'+(window.FODO_ACCOUNT?"The account service is not answering.":"The account script did not load, usually an old copy in your browser.")+' Press Ctrl+Shift+R to reload, or try again in a minute.</p><button class="btn" type="button" id="ac-reload">Try again</button></div>';
var b=document.getElementById("ac-reload");if(b)b.addEventListener("click",function(){location.reload()});},20000);})();
