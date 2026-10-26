/* Consent-gated analytics. Does nothing unless ga4Id / metaPixelId are set in config.js AND the visitor accepted analytics cookies. */
(function(){
  var C=window.FODO||{}, loaded=false;
  function consented(){ try{ var s=JSON.parse(localStorage.getItem("fodo-consent")||"null"); return !!(s&&s.analytics); }catch(e){ return false; } }
  function load(){
    if(loaded||!consented())return; loaded=true;
    if(C.ga4Id){
      var s=document.createElement("script"); s.async=true; s.src="https://www.googletagmanager.com/gtag/js?id="+encodeURIComponent(C.ga4Id); document.head.appendChild(s);
      window.dataLayer=window.dataLayer||[]; window.gtag=function(){dataLayer.push(arguments);}; gtag("js",new Date()); gtag("config",C.ga4Id,{anonymize_ip:true});
    }
    if(C.metaPixelId){
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");
      fbq("init",C.metaPixelId); fbq("track","PageView");
    }
  }
  window.FODO_TRACK=function(name,params){ try{ if(window.gtag)gtag("event",name,params||{}); if(window.fbq&&name==="generate_lead")fbq("track","Lead"); }catch(e){} };
  window.addEventListener("fodo:analytics-consent",load); load();
  if(/\/thank-you\/?$/.test(location.pathname))setTimeout(function(){FODO_TRACK("generate_lead",{method:"website_form"});},1500);
})();
