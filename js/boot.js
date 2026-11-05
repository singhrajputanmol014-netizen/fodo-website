/* v50.8 (S6): the head script of every public page, formerly inline: theme before first paint, and whether to play the opening
   animation (first page of a visit only; never for reduced motion or automated browsers). */
try{var t=localStorage.getItem("fodo-theme")||"dark";document.documentElement.setAttribute("data-theme",t)}catch(e){document.documentElement.setAttribute("data-theme","dark")}
try{var q=/[?&]intro=1/.test(location.search);if(q||(!sessionStorage.getItem("fodo-intro")&&!matchMedia("(prefers-reduced-motion:reduce)").matches&&!navigator.webdriver)){document.documentElement.classList.add("intro");sessionStorage.setItem("fodo-intro","1")}}catch(e){}
/* the meta policy cannot report by itself: send what it blocked to /api/csp-report (grouped counts only; at most 5 per page view) */
(function(){var n=0;document.addEventListener("securitypolicyviolation",function(e){if(++n>5||!navigator.sendBeacon)return;try{navigator.sendBeacon("/api/csp-report",JSON.stringify({"csp-report":{"effective-directive":e.effectiveDirective||e.violatedDirective,"blocked-uri":e.blockedURI||"inline","document-uri":location.href.split(/[?#]/)[0],"disposition":e.disposition}}))}catch(x){}})})();
