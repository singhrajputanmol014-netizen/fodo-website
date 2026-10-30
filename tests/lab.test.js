const {chromium}=require('playwright');
const SHOT = require('os').tmpdir() + '/';
(async()=>{const b=await chromium.launch();let pass=0,fail=0;const ok=(c,m)=>{if(c)pass++;else{fail++;console.log('FAIL',m)}};
for(const [w,mob] of [[1440,false],[390,true]]){
const c=await b.newContext({viewport:{width:w,height:w<800?844:900},isMobile:mob,hasTouch:mob});await c.addInitScript(()=>{try{localStorage.setItem('fodo-theme','light');sessionStorage.setItem('fodo-loaded','1');sessionStorage.setItem('fodo-bot','1');localStorage.setItem('fodo-consent','essential')}catch(e){}});
const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/ERR_TUNNEL|Failed to load/.test(m.text()))errs.push(m.text())});
const B='http://localhost:8765';
// QUIZ
await p.goto(B+'/marketing-quiz/',{waitUntil:'networkidle'});await p.evaluate(()=>document.querySelectorAll('.cookie').forEach(e=>e.remove()));
ok(await p.isVisible('.lab-bar'),'lab bar on quiz');
await p.click('[data-start="practice"]');
for(let i=0;i<10;i++){ await p.waitForSelector('.qz-opt');
  if(i===1){ await p.click('[data-ff]'); ok(await p.$$eval('.qz-opt',o=>o.filter(x=>x.style.visibility==='hidden').length)===2,'50:50 hides 2'); }
  if(i===2){ const q1=await p.textContent('#qq'); await p.click('[data-skip]'); ok(q1!==(await p.textContent('#qq')),'skip swaps question'); }
  const a=await p.evaluate(()=>{const q=document.querySelector('#qq').textContent;return null});
  const btns=await p.$$('.qz-opt:not([disabled])'); await btns[0].click(); await p.waitForSelector('[data-next]'); await p.click('[data-next]'); }
await p.waitForSelector('.qz-result');ok(/points/.test(await p.textContent('.qz-score')),'quiz result');
if(!mob) await p.screenshot({path:SHOT+'lab-quiz-result.png'});
// quiz in progress screenshot
await p.click('[data-again]');await p.click('[data-start="daily"]');await p.waitForSelector('.qz-opt');await p.keyboard.press('2');await p.waitForTimeout(300);
ok(await p.$('.qz-opt.correct')!==null,'keyboard answer');await p.screenshot({path:SHOT+`lab-quiz-${w}.png`});
// SCORE
await p.goto(B+'/growth-score/',{waitUntil:'networkidle'});await p.evaluate(()=>document.querySelectorAll('.cookie').forEach(e=>e.remove()));
for(let s=0;s<12;s++){ const step=await p.$('#score-form .step:not([hidden])'); if(!step)break;
  const inp=await step.$('input[type=radio]'); if(inp) await step.$$eval('input[type=radio]',r=>{const x=r[Math.floor(r.length/2)];x.checked=true;x.dispatchEvent(new Event('change',{bubbles:true}))});
  const t=await step.$('input[name=handle]'); if(t) await t.fill('@fodo.co.in'); const sel=await step.$('select'); if(sel) await sel.selectOption({index:2});
  if(await p.isVisible('[data-run]')){ await p.click('[data-run]'); break;} await p.click('[data-next]'); }
await p.waitForSelector('.gs-plan',{timeout:10000}).catch(()=>{});ok(await p.$('.gs-plan')!==null,'score plan rendered');
await p.waitForTimeout(800);await p.screenshot({path:SHOT+`lab-score-${w}.png`,fullPage:false});
// GAME
await p.goto(B+'/fodo-challenge/',{waitUntil:'networkidle'});await p.evaluate(()=>document.querySelectorAll('.cookie').forEach(e=>e.remove()));
ok(await p.isVisible('#start-daily'),'daily button');await p.screenshot({path:SHOT+`lab-game-intro-${w}.png`});
await p.click('#start-daily');await p.waitForSelector('[data-pick]');await p.click('[data-pick="b"]');await p.waitForTimeout(400);
await p.screenshot({path:SHOT+`lab-game-play-${w}.png`});
// fast-forward to end
await p.evaluate(()=>{ for(let k=0;k<80;k++){ const c=document.querySelector('#game [data-cont]'); if(c){c.click();continue;} const pk=document.querySelector('#game [data-pick]:not([disabled])'); if(pk){pk.click();continue;} const op=document.querySelector('#game [data-opt]:not([disabled])'); if(op){op.click();continue;}
  const it=document.querySelector('#game [data-item]'); const sl=[...document.querySelectorAll('#game [data-slot]')].find(x=>/drop here/i.test(x.textContent)); if(it&&sl){ it.click(); [...document.querySelectorAll('#game [data-slot]')].find(x=>/drop here/i.test(x.textContent)).click(); continue;} const ch=document.querySelector('#game [data-check]:not([disabled])'); if(ch){ch.click();continue;} }});
await p.waitForTimeout(800);ok(await p.$('.gm-progress')!==null,'game progress panel');await p.screenshot({path:SHOT+`lab-game-end-${w}.png`});
// AUDIT
await p.goto(B+'/contact/?mode=audit&score=47',{waitUntil:'networkidle'});ok(await p.isVisible('.audit-score'),'audit score banner');
await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:SHOT+`lab-audit-${w}.png`,fullPage:true});
ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no overflow '+w);
console.log(w,'errors:',errs.join(' | ')||'none');await c.close();}
console.log(`lab: ${pass}/${pass+fail}`);await b.close()})();
