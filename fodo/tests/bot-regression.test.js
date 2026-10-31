#!/usr/bin/env node
/* FODO Bot regression suite — runs every case against the REAL site bot in headless Chromium.
 * Usage (from the fodo folder):  node tests/bot-regression.test.js [--verbose]
 * Needs: Node 18+, and Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
 */
const http=require("http"), fs=require("fs"), path=require("path");
const {CASES}=require("./bot-cases.js");
const ROOT=path.resolve(__dirname,".."), VERBOSE=process.argv.includes("--verbose");
const TYPES={".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".json":"application/json"};
const srv=http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split("?")[0]); if(p.endsWith("/"))p+="index.html"; const f=path.join(ROOT,p); if(!f.startsWith(ROOT)||!fs.existsSync(f)){res.writeHead(404);return res.end("nf");} res.writeHead(200,{"content-type":TYPES[path.extname(f)]||"application/octet-stream"}); fs.createReadStream(f).pipe(res); });
srv.listen(0,async()=>{
  const port=srv.address().port; let chromium; try{ ({chromium}=require("playwright")); }catch(e){ console.error("Playwright not installed: npm i -D playwright"); process.exit(2); }
  const b=await chromium.launch(); const p=await b.newPage(); const errs=[]; p.on("pageerror",e=>errs.push(e.message));
  await p.goto(`http://localhost:${port}/`,{waitUntil:"load"}); await p.mouse.move(5,5);
  await p.waitForFunction(()=>window.FODO_MIND&&window.FODO_BOT_LLM,null,{timeout:20000});
  let pass=0, fail=0; const byCat={};
  for(const [cat,q,ok,not] of CASES){
    const turns=Array.isArray(q)?q:[q];
    const out=await p.evaluate((turns)=>{ try{sessionStorage.clear();}catch(e){} window.FODO_MIND.reset(); const r=[]; for(const t of turns){ let h; try{ h=window.FODO_BOT.answer(t); }catch(e){ h="THROW "+e.message; } const d=document.createElement("div"); d.innerHTML=String(h); d.querySelectorAll(".hi").forEach(x=>x.remove()); r.push(d.textContent.replace(/\s+/g," ").trim()); } return r; },turns);
    const last=out[out.length-1]; const good=ok.test(last)&&!(not&&not.test(last))&&last.length>0;
    byCat[cat]=byCat[cat]||{pass:0,fail:0}; byCat[cat][good?"pass":"fail"]++; good?pass++:fail++;
    if(!good||VERBOSE) console.log(`${good?"PASS":"FAIL"} [${cat}] ${turns.join(" → ")}\n   ↳ ${last.slice(0,400)}`);
  }
  console.log("\nBy category:"); for(const c in byCat) console.log(`  ${c.padEnd(10)} ${byCat[c].pass}/${byCat[c].pass+byCat[c].fail}`);
  console.log(`\nTOTAL ${pass}/${pass+fail} passed · page errors: ${errs.length?errs.join(" | "):"none"}`);
  await b.close(); srv.close(); process.exit(fail||errs.length?1:0);
});
