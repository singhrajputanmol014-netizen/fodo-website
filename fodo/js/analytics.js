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
  /* One event function for the whole site. Sends to exactly one destination (gtag → Cloudflare Zaraz → GTM dataLayer),
     so an event is never counted twice, and only when an analytics tool is actually present. Never sends form values,
     names, emails or phone numbers. */
  window.FODO_TRACK=function(name,params){ try{ params=params||{}; params.page_path=params.page_path||location.pathname;
    if(window.gtag)gtag("event",name,params); else if(window.zaraz&&typeof zaraz.track==="function")zaraz.track(name,params); else if(window.dataLayer&&window.google_tag_manager)dataLayer.push(Object.assign({event:name},params));
    if(window.fbq&&name==="generate_lead")fbq("track","Lead"); }catch(e){} };
  /* v17.1 Growth Lab tool usage: one event name for every tool (tool_start / tool_complete + which tool) so the admin dashboard can
     show views → starts → completions per tool; a logged-in user's completion is also added to their account activity. */
  var _done={}; window.FODO_TOOL=function(stage,tool,detail,once){ try{ if(once){ var k=stage+"|"+tool; if(_done[k])return; _done[k]=1; }
    window.FODO_TRACK("tool_"+stage,{tool:tool});
    var A=window.FODO_ACCOUNT; if(stage==="complete"&&A&&A.current&&A.current()&&A.api) A.api("event",{kind:"tool_use",detail:tool+(detail!=null&&detail!==""?" · "+String(detail).slice(0,80):"")}).catch(function(){}); }catch(e){} };
  /* Conversion events (delegated — works for links the scripts add later) */
  try{
    var T=function(n,p){ window.FODO_TRACK(n,p); }, txt=function(el){ return (el.getAttribute("aria-label")||el.textContent||"").replace(/\s+/g," ").trim().slice(0,60); };
    var where=function(el){ var s=el.closest("section[id],header,footer,[id]"); return s?(s.id||s.tagName.toLowerCase()):""; };
    document.addEventListener("click",function(ev){ var a=ev.target.closest&&ev.target.closest("a,button"); if(!a)return;
      var href=a.getAttribute("href")||"", route=a.getAttribute("data-route")||"", loc=where(a);
      if(a.hasAttribute("data-wa")||/wa\.me\/|api\.whatsapp\.com/.test(href))return T("whatsapp_click",{link_location:loc});
      if(/^tel:/.test(href))return T("phone_click",{link_location:loc});
      if(/^mailto:/.test(href))return T("email_click",{link_location:loc});
      if(route==="call"||/mode=call/.test(href))return T("booking_click",{link_location:loc});
      if(route==="audit"||/mode=audit/.test(href))return T("audit_cta_click",{cta_text:txt(a),link_location:loc});
      if(/^https?:/.test(href)){ try{ var u=new URL(href); if(u.hostname!==location.hostname)return T("outbound_click",{link_domain:u.hostname,link_location:loc}); }catch(e){} }
      if(a.classList.contains("btn"))T("cta_click",{cta_text:txt(a),cta_route:route||href.replace(/[?#].*$/,"").slice(0,80),link_location:loc});
    },{capture:true,passive:true});
    var TOOLS={"competitor-finder":"competitor_finder","growth-score":"growth_score","roi":"roi_calculator","quiz":"marketing_quiz","game":"fodo_challenge","templates":"templates"};
    document.addEventListener("submit",function(ev){ var f=ev.target; if(!f||f.tagName!=="FORM")return; var r=document.body.getAttribute("data-route")||"";
      T("form_submit",{form_id:(f.id||f.getAttribute("name")||"form").slice(0,40),link_location:where(f)});
      if(TOOLS[r])T("tool_use",{tool:TOOLS[r],form_id:(f.id||"").slice(0,40)}); },{capture:true});
    var marks=[25,50,75],sent={}; addEventListener("scroll",function(){ var h=document.documentElement, max=h.scrollHeight-innerHeight; if(max<200)return; var pc=Math.round(scrollY/max*100);
      marks.forEach(function(m){ if(pc>=m&&!sent[m]){ sent[m]=1; T("scroll_depth",{percent_scrolled:m}); } }); },{passive:true});
  }catch(e){}
  window.addEventListener("fodo:analytics-consent",load); load();
  if(/\/thank-you\/?$/.test(location.pathname))setTimeout(function(){FODO_TRACK("generate_lead",{method:"website_form"});},1500);
})();
