/* FODO Bot: MIND · Layer 6: CALCULATOR (safe maths + marketing metrics + funnel economics)
 * No eval(), no Function(): a small recursive-descent parser over a whitelisted token set.
 * Exposes window.FODO_BOT_CALCULATOR = { calculate, evaluate, calculateMetric, funnel, reverseFunnel, breakEvenRoas, fmt, inr }.
 */
(function(){
  "use strict";
  const MAX_LEN=160, MAX_TOKENS=80;

  /* ---------- formatting ---------- */
  function fmt(n,dp){
    if(!Number.isFinite(n))return String(n);
    const d=dp==null?(Math.abs(n)>=100?2:Math.abs(n)>=1?4:6):dp;
    const r=Number(n.toFixed(d));
    return r.toLocaleString("en-IN",{maximumFractionDigits:d});
  }
  function inr(n){ if(!Number.isFinite(n))return "₹—"; const a=Math.abs(n); return (n<0?"−":"")+"₹"+(a>=100?Math.round(a).toLocaleString("en-IN"):Number(a.toFixed(2)).toLocaleString("en-IN")); }
  const pct=(n,dp)=>fmt(n,dp==null?2:dp)+"%";

  /* ---------- safe expression parser ---------- */
  function words2ops(s){
    return String(s).toLowerCase()
      .replace(/,(?=\d{2,3}\b)/g,"")             // 1,00,000 / 10,000
      .replace(/×|✕|✖/g,"*").replace(/÷/g,"/").replace(/[−–—]/g,"-")
      .replace(/\bmultiplied by\b|\btimes\b|\binto\b|\bguna\b/g,"*")
      .replace(/\bdivided by\b|\bdivide by\b|\bover\b|\bbhag\b/g,"/")
      .replace(/(\d)\s*by\s*(\d)/g,"$1/$2")
      .replace(/\bplus\b|\bjoda\b|\bjod\b|\badd\b/g,"+")
      .replace(/\bminus\b|\bghata\b|\bless\b/g,"-")
      .replace(/\bto the power of\b|\bto the power\b|\bpower of\b|\braised to\b|\*\*/g,"^")
      .replace(/(\d)\s*x\s*(?=[\d(])/g,"$1*")
      .replace(/\bsquare root of\b|\bsqrt of\b|\broot of\b/g,"sqrt ")
      .replace(/\bcube root of\b/g,"cbrt ")
      .replace(/(\d(?:\.\d+)?)\s*squared\b/g,"($1^2)").replace(/(\d(?:\.\d+)?)\s*cubed\b/g,"($1^3)")
      .replace(/(\d(?:\.\d+)?)\s*(k|thousand)\b/g,"($1*1000)").replace(/(\d(?:\.\d+)?)\s*(lakh|lakhs|lac|lacs|l)\b/g,"($1*100000)").replace(/(\d(?:\.\d+)?)\s*(crore|crores|cr)\b/g,"($1*10000000)");
  }
  function tokenize(e){
    const t=[]; let i=0;
    while(i<e.length){
      const c=e[i];
      if(/\s/.test(c)){i++;continue;}
      if(/[0-9.]/.test(c)){ let j=i+1; while(j<e.length&&/[0-9.]/.test(e[j]))j++; const v=Number(e.slice(i,j)); if(!Number.isFinite(v))return null; t.push({k:"n",v}); i=j; continue; }
      if("+-*/%^()!".includes(c)){ t.push({k:c}); i++; continue; }
      const w=e.slice(i).match(/^(sqrt|cbrt|abs|log|ln|sin|cos|tan|fact|pi|e)\b/);
      if(w){ t.push({k:"f",v:w[1]}); i+=w[1].length; continue; }
      return null;
      // (unknown characters → not a pure expression)
    }
    return t.length&&t.length<=MAX_TOKENS?t:null;
  }
  function parse(t){
    let p=0;
    const peek=()=>t[p], eat=k=>{ if(t[p]&&t[p].k===k){p++;return true;} return false; };
    function primary(){
      const x=t[p]; if(!x)throw new Error("end");
      if(x.k==="n"){p++; return postfix(x.v);}
      if(x.k==="("){p++; const v=expr(); if(!eat(")"))throw new Error("paren"); return postfix(v);}
      if(x.k==="+"){p++; return primary();}
      if(x.k==="-"){p++; return -power();}
      if(x.k==="f"){p++;
        if(x.v==="pi")return postfix(Math.PI); if(x.v==="e")return postfix(Math.E);
        const a=power();
        const F={fact:v=>{ if(v<0||v>170||Math.floor(v)!==v)throw new Error("fact"); let r=1; for(let i=2;i<=v;i++)r*=i; return r; },sqrt:Math.sqrt,cbrt:Math.cbrt,abs:Math.abs,log:Math.log10,ln:Math.log,sin:v=>Math.sin(v*Math.PI/180),cos:v=>Math.cos(v*Math.PI/180),tan:v=>Math.tan(v*Math.PI/180)};
        if(x.v==="sqrt"&&a<0)throw new Error("domain");
        return F[x.v](a);
      }
      throw new Error("token");
    }
    function postfix(v){
      while(t[p]&&(t[p].k==="%"||t[p].k==="!")){
        if(t[p].k==="%"){ // percent: 20% → 0.2 unless used as modulo between numbers
          const nx=t[p+1]; if(nx&&(nx.k==="n"||nx.k==="("||nx.k==="f"))break;
          p++; v=v/100;
        } else { p++; if(v<0||v>170||Math.floor(v)!==v)throw new Error("fact"); let r=1; for(let i=2;i<=v;i++)r*=i; v=r; }
      }
      return v;
    }
    function power(){ const b=primary(); if(eat("^")){ const ex=unaryPow(); return Math.pow(b,ex);} return b; }
    function unaryPow(){ if(eat("-"))return -unaryPow(); if(eat("+"))return unaryPow(); return power(); }
    function term(){ let v=power(); for(;;){ const x=peek(); if(!x)break;
        if(x.k==="*"){p++; v*=power();} else if(x.k==="/"){p++; const d=power(); if(d===0)throw new Error("div0"); v/=d;} else if(x.k==="%"){p++; const d=power(); if(d===0)throw new Error("div0"); v%=d;}
        else if(x.k==="("||x.k==="f"){ v*=power(); } // implicit multiplication: 2(3+4)
        else break; }
      return v; }
    function expr(){ let v=term(); for(;;){ const x=peek(); if(!x)break;
        if(x.k==="+"){p++; const r=term(); v=addPct(v,r,t[p-1]);} else if(x.k==="-"){p++; const r=term(); v=subPct(v,r);} else break; }
      return v; }
    // "500 + 20%" → 600 (calculator convention) is handled in calculate() before parse; keep plain arithmetic here
    function addPct(a,b){ return a+b; } function subPct(a,b){ return a-b; }
    const v=expr(); if(p!==t.length)throw new Error("trailing"); if(!Number.isFinite(v))throw new Error("nan"); return v;
  }
  function evaluate(expression){
    const e=words2ops(expression).replace(/[=?]+\s*$/,"").trim();
    if(!e||e.length>MAX_LEN)return null;
    const t=tokenize(e); if(!t)return null;
    if(!t.some(x=>x.k==="n"||x.k==="f"&&/pi|e/.test(x.v)))return null;
    try{ return parse(t); }catch(err){ return err&&err.message==="div0"?{error:"div0"}:null; }
  }

  /* ---------- natural-language maths ---------- */
  const UNITS={ // to base
    km:["len",1000],kilometer:["len",1000],kilometers:["len",1000],kilometre:["len",1000],kilometres:["len",1000],m:["len",1],meter:["len",1],meters:["len",1],metre:["len",1],metres:["len",1],cm:["len",.01],mm:["len",.001],mile:["len",1609.344],miles:["len",1609.344],ft:["len",.3048],feet:["len",.3048],foot:["len",.3048],inch:["len",.0254],inches:["len",.0254],in:["len",.0254],yard:["len",.9144],yards:["len",.9144],
    kg:["mass",1],kgs:["mass",1],kilogram:["mass",1],kilograms:["mass",1],g:["mass",.001],gram:["mass",.001],grams:["mass",.001],lb:["mass",.45359237],lbs:["mass",.45359237],pound:["mass",.45359237],pounds:["mass",.45359237],oz:["mass",.0283495],ounce:["mass",.0283495],ounces:["mass",.0283495],
    l:["vol",1],liter:["vol",1],litre:["vol",1],liters:["vol",1],litres:["vol",1],ml:["vol",.001],gallon:["vol",3.78541],gallons:["vol",3.78541],
    c:["temp","c"],celsius:["temp","c"],f:["temp","f"],fahrenheit:["temp","f"],k:["temp","k"],kelvin:["temp","k"],
    sec:["time",1],second:["time",1],seconds:["time",1],min:["time",60],minute:["time",60],minutes:["time",60],hr:["time",3600],hour:["time",3600],hours:["time",3600],day:["time",86400],days:["time",86400],week:["time",604800],weeks:["time",604800]
  };
  function convert(q){
    const m=q.match(/(-?\d+(?:\.\d+)?)\s*(°\s*)?([a-z]+)\s+(?:to|in|into|=)\s+(°\s*)?([a-z]+)/);
    if(!m)return null; const v=+m[1], a=UNITS[m[3]], b=UNITS[m[5]]; if(!a||!b||a[0]!==b[0])return null;
    let r;
    if(a[0]==="temp"){ const toC={c:x=>x,f:x=>(x-32)*5/9,k:x=>x-273.15}[a[1]](v); r={c:toC,f:toC*9/5+32,k:toC+273.15}[b[1]]; }
    else r=v*a[1]/b[1];
    return {result:r,text:`${fmt(v)} ${m[3]} = <b>${fmt(r)} ${m[5]}</b>`};
  }
  function calculate(input){
    const raw=String(input||"").trim(); if(!raw||raw.length>MAX_LEN)return null;
    let q=raw.toLowerCase().replace(/₹|\brs\.?\s?(?=\d)|\binr\b\s?/g,"").replace(/factorial of (\d+)|(\d+) factorial/g,(m,a,b)=>"fact("+(a||b)+")").replace(/[?!]+$/,"").trim()
      .replace(/^(please |pls |plz )/,"").replace(/^(calculate|calc|compute|solve|evaluate|find|what is|what's|whats|what are|how much is|tell me|bata(o)?|batao)\s+/,"").replace(/\s+(kitna|kitne|hota) (hai|h|hoga)$/,"").replace(/\s*=\s*$/,"").trim();
    // conversions
    const cv=convert(q); if(cv)return {result:cv.result,formatted:fmt(cv.result),html:cv.text,kind:"convert"};
    let m;
    // GST / tax / tip: "18% gst on 5000"
    if((m=q.match(/^(\d+(?:\.\d+)?)\s*%\s*(gst|tax|vat|tds|tip|service charge|commission|discount)\s*(?:on|of|for)\s*(-?\d[\d,]*(?:\.\d+)?\s*(?:k|lakh|lac|l|cr|crore)?)$/))){ const r=+m[1], kind=m[2], base=evaluate(m[3]); if(typeof base==="number"){ const amt=base*r/100; const total=kind==="discount"||kind==="tds"?base-amt:base+amt; return {result:amt,formatted:fmt(amt),html:`${r}% ${kind.toUpperCase()==="GST"?"GST":kind} on ${fmt(base)} = <b>${fmt(amt)}</b> · ${kind==="discount"||kind==="tds"?"net":"total"} <b>${fmt(total)}</b>`+(kind==="gst"?"<br><small>For an inclusive price, GST part = price × rate ÷ (100 + rate).</small>":""),kind:"tax"}; } }
    // a% of b
    if((m=q.match(/^(-?\d[\d,]*(?:\.\d+)?)\s*(?:%|percent|per cent)\s*(?:of|ka)\s*(-?\d[\d,.]*\s*(?:k|lakh|lac|l|cr|crore)?)$/))){ const a=+m[1].replace(/,/g,""), b=evaluate(m[2]); if(typeof b==="number"){ const r=a*b/100; return {result:r,formatted:fmt(r),html:`${fmt(a)}% of ${fmt(b)} = <b>${fmt(r)}</b>`,kind:"pct"}; } }
    // x is what % of y
    if((m=q.match(/^(-?\d[\d,]*(?:\.\d+)?)\s*(?:is )?what (?:percent|percentage|%) (?:of|is) (-?\d[\d,]*(?:\.\d+)?)$/))){ const a=+m[1].replace(/,/g,""), b=+m[2].replace(/,/g,""); if(b){ const r=a/b*100; return {result:r,formatted:pct(r),html:`${fmt(a)} is <b>${pct(r)}</b> of ${fmt(b)}`,kind:"pct"}; } }
    // percentage change from a to b
    if((m=q.match(/(?:percent(?:age)? (?:change|increase|decrease|growth)|growth|change) (?:from )?(-?\d[\d,]*(?:\.\d+)?) to (-?\d[\d,]*(?:\.\d+)?)/))){ const a=+m[1].replace(/,/g,""), b=+m[2].replace(/,/g,""); if(a){ const r=(b-a)/Math.abs(a)*100; return {result:r,formatted:pct(r),html:`From ${fmt(a)} to ${fmt(b)} is a <b>${r>=0?"+":""}${pct(r)}</b> change`,kind:"pct"}; } }
    // a + b%  /  a - b%  / b% off a
    if((m=q.match(/^(-?\d[\d,]*(?:\.\d+)?)\s*([+-])\s*(\d+(?:\.\d+)?)\s*%$/))){ const a=+m[1].replace(/,/g,""), b=+m[3]; const r=m[2]==="+"?a*(1+b/100):a*(1-b/100); return {result:r,formatted:fmt(r),html:`${fmt(a)} ${m[2]} ${b}% = <b>${fmt(r)}</b>`,kind:"pct"}; }
    if((m=q.match(/^(\d+(?:\.\d+)?)\s*%\s*off\s*(?:on\s*)?(-?\d[\d,]*(?:\.\d+)?)$/))){ const b=+m[1], a=+m[2].replace(/,/g,""); const r=a*(1-b/100); return {result:r,formatted:fmt(r),html:`${b}% off ${fmt(a)} = <b>${fmt(r)}</b> (you save ${fmt(a-r)})`,kind:"pct"}; }
    if((m=q.match(/^(?:increase|raise) (-?\d[\d,]*(?:\.\d+)?) by (\d+(?:\.\d+)?)\s*%$/))){ const a=+m[1].replace(/,/g,""), b=+m[2]; const r=a*(1+b/100); return {result:r,formatted:fmt(r),html:`${fmt(a)} increased by ${b}% = <b>${fmt(r)}</b>`,kind:"pct"}; }
    if((m=q.match(/^(?:decrease|reduce) (-?\d[\d,]*(?:\.\d+)?) by (\d+(?:\.\d+)?)\s*%$/))){ const a=+m[1].replace(/,/g,""), b=+m[2]; const r=a*(1-b/100); return {result:r,formatted:fmt(r),html:`${fmt(a)} decreased by ${b}% = <b>${fmt(r)}</b>`,kind:"pct"}; }
    // average of list
    if((m=q.match(/^(?:average|avg|mean) (?:of )?([\d.,\s and]+)$/))){ const xs=m[1].split(/[\s,]+|and/).map(Number).filter(Number.isFinite).filter((x,i,a)=>String(x)!=="NaN"); if(xs.length>=2){ const r=xs.reduce((a,b)=>a+b,0)/xs.length; return {result:r,formatted:fmt(r),html:`Average of ${xs.map(x=>fmt(x)).join(", ")} = <b>${fmt(r)}</b>`,kind:"avg"}; } }
    // compound interest (educational)
    if((m=q.match(/compound(?:ed)? interest (?:on )?(\d[\d,]*(?:\.\d+)?(?:\s*(?:k|lakh|l|cr))?) (?:at )?(\d+(?:\.\d+)?)\s*% (?:for )?(\d+(?:\.\d+)?) years?/))){ const P=evaluate(m[1]), r=+m[2], y=+m[3]; if(typeof P==="number"){ const A=P*Math.pow(1+r/100,y); return {result:A,formatted:fmt(A),html:`${inr(P)} at ${r}% a year, compounded yearly for ${y} years ≈ <b>${inr(A)}</b> (interest ≈ ${inr(A-P)}). Illustrative only, real returns vary.`,kind:"ci"}; } }
    // pure expression (must contain an operator or function)
    const expr=q.replace(/^(?:what is|whats)\s+/,"");
    if(!/[0-9]/.test(expr))return null;
    const hasOp=/[+\-*/^%()!x×÷]|\b(fact|plus|minus|times|into|multiplied|divided|over|power|squared|cubed|sqrt|square root|cube root|root of|by|guna|bhag)\b/.test(expr);
    if(!hasOp)return null;
    const v=evaluate(expr);
    if(v&&v.error==="div0")return {error:"div0",html:"Division by zero isn't defined, even the best marketer can't split something into zero parts. 🙂"};
    if(typeof v!=="number")return null;
    return {result:v,formatted:fmt(v),html:`${prettyExpr(expr)} = <b>${fmt(v)}</b>`,kind:"expr"};
  }
  function prettyExpr(e){ return words2ops(e).replace(/\*/g," × ").replace(/\//g," ÷ ").replace(/\+/g," + ").replace(/(\d|\))-/g,"$1 − ").replace(/\^/g,"^").replace(/\s+/g," ").replace(/&/g,"&amp;").replace(/</g,"&lt;").trim(); }

  /* ---------- marketing metrics ---------- */
  // ctx: {spend, budget, revenue, aov, leads, clicks, impressions, visitors, appointments, customers, qualified, margin, closeRate, cvr}
  function calculateMetric(q,ctx){
    q=String(q||"").toLowerCase(); ctx=ctx||{};
    const S=ctx.spend!=null?ctx.spend:ctx.budget, out=[];
    const want=k=>new RegExp("\\b("+k+")\\b").test(q);
    const asked=[];
    const add=(name,val,formula,note)=>{ out.push({name,val,formula,note}); };
    if(want("ctr|click.?through")&&ctx.clicks!=null&&ctx.impressions) add("CTR",pct(ctx.clicks/ctx.impressions*100),`clicks ÷ impressions × 100 = ${fmt(ctx.clicks)} ÷ ${fmt(ctx.impressions)} × 100`,"Context matters: search ads usually see higher CTR than feed ads; compare against your own past campaigns.");
    if(want("cpc|cost per click")&&S!=null&&ctx.clicks) add("CPC",inr(S/ctx.clicks),`spend ÷ clicks = ${inr(S)} ÷ ${fmt(ctx.clicks)}`,"A cheap click is only good if it turns into qualified leads.");
    if(want("cpm|cost per (thousand|mille)")&&S!=null&&ctx.impressions) add("CPM",inr(S/ctx.impressions*1000),`spend ÷ impressions × 1,000 = ${inr(S)} ÷ ${fmt(ctx.impressions)} × 1,000`,"CPM reflects auction competition and audience size, not creative quality alone.");
    if(want("cpl|cost per lead")&&S!=null&&ctx.leads) add("CPL",inr(S/ctx.leads),`spend ÷ leads = ${inr(S)} ÷ ${fmt(ctx.leads)}`,"Judge CPL together with lead quality, qualified rate and close rate decide whether it's actually cheap.");
    if(want("cpa|cost per (acquisition|sale|order|customer)|cac")&&S!=null&&ctx.customers) add(/cac/.test(q)?"CAC":"CPA",inr(S/ctx.customers),`spend ÷ customers = ${inr(S)} ÷ ${fmt(ctx.customers)}`,"True CAC also includes agency fees, creative and sales costs, not just ad spend.");
    if(want("roas")&&S&&ctx.revenue!=null) add("ROAS",fmt(ctx.revenue/S,2)+"x",`revenue ÷ ad spend = ${inr(ctx.revenue)} ÷ ${inr(S)}`,"ROAS ignores margin. A 3x ROAS can still lose money if your margin is 25%.");
    if(want("roi")&&S&&ctx.revenue!=null){
      if(ctx.margin!=null){ const gp=ctx.revenue*ctx.margin/100; add("ROI (on gross profit)",pct((gp-S)/S*100,1),`(revenue × margin − cost) ÷ cost = (${inr(ctx.revenue)} × ${ctx.margin}% − ${inr(S)}) ÷ ${inr(S)}`,"This version uses gross profit, which is closer to real return than revenue."); }
      else add("ROI (on revenue)",pct((ctx.revenue-S)/S*100,1),`(revenue − cost) ÷ cost × 100 = (${inr(ctx.revenue)} − ${inr(S)}) ÷ ${inr(S)} × 100`,"Assumption: this uses revenue, not profit. Share your margin % and I'll compute ROI on gross profit, which is the honest version.");
    }
    if(want("cvr|conversion rate|conversion")&&ctx.customers!=null&&(ctx.visitors||ctx.clicks||ctx.leads)){ const base=ctx.visitors||ctx.clicks||ctx.leads, label=ctx.visitors?"visitors":ctx.clicks?"clicks":"leads"; add("Conversion rate",pct(ctx.customers/base*100),`conversions ÷ ${label} × 100 = ${fmt(ctx.customers)} ÷ ${fmt(base)} × 100`,"Always state the base (visitors, clicks or leads), conversion rates aren't comparable otherwise."); }
    else if(want("cvr|conversion rate|conversion")&&ctx.leads!=null&&(ctx.visitors||ctx.clicks)){ const base=ctx.visitors||ctx.clicks; add("Visitor→lead rate",pct(ctx.leads/base*100),`leads ÷ ${ctx.visitors?"visitors":"clicks"} × 100 = ${fmt(ctx.leads)} ÷ ${fmt(base)} × 100`,"Landing pages vary widely; your own trend matters more than an industry average."); }
    if(want("aov|average order")&&ctx.revenue!=null&&ctx.customers) add("AOV",inr(ctx.revenue/ctx.customers),`revenue ÷ orders = ${inr(ctx.revenue)} ÷ ${fmt(ctx.customers)}`,"Raising AOV (bundles, upsells) makes every acquisition channel more affordable.");
    if(want("break.?even|breakeven")&&ctx.margin){ const be=breakEvenRoas(ctx.margin); add("Break-even ROAS",fmt(be,2)+"x",`1 ÷ contribution margin = 1 ÷ ${ctx.margin}%`,`Below ${fmt(be,2)}x you lose money on the first order (before repeat purchases). Use contribution margin, after product cost, shipping, payment fees and returns.`); }
    if(want("ltv|clv|lifetime value")&&ctx.aov){ const freq=ctx.frequency||null; if(freq) add("LTV (revenue)",inr(ctx.aov*freq),`AOV × purchases over the relationship = ${inr(ctx.aov)} × ${freq}`,"Multiply by margin for profit-based LTV."); }
    if(want("margin|profit margin")&&ctx.revenue&&ctx.cost!=null) add("Profit margin",pct((ctx.revenue-ctx.cost)/ctx.revenue*100,1),"(revenue − cost) ÷ revenue × 100","");
    return out.length?out:null;
  }
  function breakEvenRoas(marginPct){ return 100/marginPct; }

  /* ---------- funnel diagnosis from raw numbers ---------- */
  function funnel(ctx){
    const S=ctx.spend!=null?ctx.spend:null;
    const stages=[["impressions","Impressions"],["clicks","Clicks"],["visitors","Visitors"],["leads","Leads"],["qualified","Qualified leads"],["appointments","Appointments"],["customers","Customers"]].filter(([k])=>ctx[k]!=null&&ctx[k]>0);
    if(stages.length<2&&!(S&&stages.length))return null;
    const rows=[], rates=[];
    if(S){
      if(ctx.clicks) rows.push(["CPC",inr(S/ctx.clicks)]);
      if(ctx.impressions) rows.push(["CPM",inr(S/ctx.impressions*1000)]);
      if(ctx.leads) rows.push(["CPL",inr(S/ctx.leads)]);
      if(ctx.appointments) rows.push(["Cost per appointment",inr(S/ctx.appointments)]);
      if(ctx.customers) rows.push(["CAC (ad spend only)",inr(S/ctx.customers)]);
      if(ctx.revenue) rows.push(["ROAS",fmt(ctx.revenue/S,2)+"x"]);
    }
    for(let i=1;i<stages.length;i++){ const [ka,la]=stages[i-1],[kb,lb]=stages[i]; const r=ctx[kb]/ctx[ka]*100; rates.push({from:la,to:lb,key:ka+">"+kb,rate:r}); }
    // judge the weakest step against rough, conservative reference bands (used only to point at the leak, not as benchmarks)
    const REF={"impressions>clicks":[0.8,"CTR"],"clicks>visitors":[70,"click→visit"],"clicks>leads":[3,"click→lead"],"visitors>leads":[3,"visit→lead"],"leads>qualified":[40,"lead→qualified"],"leads>appointments":[20,"lead→appointment"],"qualified>appointments":[40,"qualified→appointment"],"appointments>customers":[25,"appointment→customer"],"leads>customers":[5,"lead→customer"],"qualified>customers":[15,"qualified→customer"]};
    let worst=null;
    rates.forEach(r=>{ const ref=REF[r.key]; if(ref){ const score=r.rate/ref[0]; if(!worst||score<worst.score)worst={...r,score,ref:ref[0]}; } });
    return {rows,rates,worst};
  }

  /* ---------- reverse funnel: revenue target → required customers / leads / traffic / budget ---------- */
  function reverseFunnel(ctx){
    const rev=ctx.revenue, aov=ctx.aov; if(!rev||!aov)return null;
    const customers=Math.ceil(rev/aov), out={customers,lines:[`Customers needed = ${inr(rev)} ÷ ${inr(aov)} AOV = <b>${fmt(customers,0)}</b>`]};
    const close=ctx.closeRate!=null?ctx.closeRate:null;
    if(close){ out.leads=Math.ceil(customers/(close/100)); out.lines.push(`Leads needed = ${fmt(customers,0)} ÷ ${close}% close rate = <b>${fmt(out.leads,0)}</b>`); }
    const cvr=ctx.cvr!=null?ctx.cvr:null;
    if(out.leads&&cvr){ out.visitors=Math.ceil(out.leads/(cvr/100)); out.lines.push(`Visitors needed = ${fmt(out.leads,0)} ÷ ${cvr}% landing conversion = <b>${fmt(out.visitors,0)}</b>`); }
    else if(!out.leads&&cvr){ out.visitors=Math.ceil(customers/(cvr/100)); out.lines.push(`Visitors needed = ${fmt(customers,0)} ÷ ${cvr}% conversion = <b>${fmt(out.visitors,0)}</b>`); }
    if(ctx.cpl&&out.leads){ out.budget=out.leads*ctx.cpl; out.lines.push(`Media budget ≈ ${fmt(out.leads,0)} leads × ${inr(ctx.cpl)} CPL = <b>${inr(out.budget)}</b>`); }
    return out;
  }

  window.FODO_BOT_CALCULATOR={calculate,evaluate,calculateMetric,funnel,reverseFunnel,breakEvenRoas,fmt,inr,pct,version:"2026.10.25"};
  // compatibility alias for the supplied math-calculator pack
  window.FODO_MATH_CALCULATOR=window.FODO_MATH_CALCULATOR||{calculate:q=>{ const r=calculate(q); return r&&r.result!=null?{result:r.result,formatted:r.formatted}:null; },version:"2026.10.25"};
})();
