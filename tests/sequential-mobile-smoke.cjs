// Candidate-only instrumentation; never delivered to players or the production board.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium, devices } = require('playwright');
const candidate = fs.readFileSync('index.html','utf8');
const injection = "window.__qa={state:()=>({stage,running,airScroll,engineStage:engine?.stage,signature:engine?.sources.map(s=>Array.from(s.buffer.getChannelData(0).slice(200,208))),campaign:campaign.map(s=>s.stage),playerPos,targetPos}),complete:()=>{stageProgress=30},fail:()=>crash(true)};draw()})();";
assert.equal(candidate.split('draw()})();').length,2);
assert(!/selectedStage|worldsMenu|data-world|UNLOCK WORLDS/.test(candidate));
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try {
  for(const device of ['iPhone 13','iPhone SE']){
   const context=await browser.newContext({...devices[device],defaultBrowserType:'chromium'});
   const errors=[];const page=await context.newPage();
   page.on('pageerror',e=>errors.push(String(e)));
   await page.route('**/*',async route=>{
    const url=route.request().url();
    if(url==='https://qa.invalid/'){return route.fulfill({contentType:'text/html',body:candidate.replace('draw()})();',injection)})}
    if(url==='https://qa.invalid/leaderboard.js'){return route.fulfill({contentType:'application/javascript',body:"window.rememberCampaign=c=>{window.__qaFinish=c};"})}
    return route.abort();
   });
   await page.addInitScript(()=>{localStorage.setItem('dh_world','3');localStorage.setItem('dh_worlds','[true,true,true,true]');localStorage.setItem('dh_bank','1000')});
   await page.goto('https://qa.invalid/');
   await page.locator('#garage').tap();
   assert.equal(await page.locator('[data-world],#worlds').count(),0);
   await page.locator('#mute').tap();
   assert.match(await page.locator('#mute').innerText(),/OFF/);
   await page.locator('#mute').tap();
   await page.locator('#back').tap();
   await page.locator('#go').tap();
   const state=()=>page.evaluate(()=>window.__qa.state());
   await page.waitForFunction(()=>window.__qa.state().running);
   assert.equal((await state()).stage,0);
   const cdp=await context.newCDPSession(page);
   const {width,height}=page.viewportSize();
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:width/2,y:height*.78}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width*.75,y:height*.78}]});
   await page.waitForFunction(()=>window.__qa.state().targetPos>1.1);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   const sig=[];
   // Exercise each real transition via the finish screen. Timing is advanced by
   // test-only instrumentation; this is a smoke test, not a full play-through.
   for(let s=0;s<4;s++){
    await page.waitForFunction(s=>window.__qa.state().stage===s&&window.__qa.state().running,s);
    const current=await state();assert.equal(current.engineStage,s);sig.push(JSON.stringify(current.signature));
    if(s===2){const before=current.airScroll;await page.waitForFunction(before=>window.__qa.state().airScroll>before+3,before); }
    await page.evaluate(()=>window.__qa.complete());
    await page.locator('#nextstage').waitFor({state:'visible'});
    assert.deepEqual((await state()).campaign,Array.from({length:s+1},(_,i)=>i));
    if(s<3)await page.locator('#nextstage').tap();
   }
   assert.equal(new Set(sig).size,4,'four distinct engine buffers');
   assert.match(await page.locator('#box h1').innerText(),/YOU WIN/);
   assert.deepEqual(await page.evaluate(()=>window.__qaFinish.map(s=>s.stage)),[0,1,2,3]);
   await page.locator('#nextstage').tap();assert.equal((await state()).stage,0);
   await page.evaluate(()=>window.__qa.complete());await page.locator('#nextstage').waitFor({state:'visible'});await page.locator('#nextstage').tap();
   assert.equal((await state()).stage,1);
   await page.evaluate(()=>window.__qa.fail());await page.locator('#again').tap();assert.equal((await state()).stage,0);
   assert.equal(await page.evaluate(()=>localStorage.getItem('dh_world')),'3','legacy save untouched');
   assert.deepEqual(errors,[]);
   console.log(device+': touch steering, legacy saves, sequence, distinct audio buffers, air motion, victory and retry passed');
   await context.close();
  }
  const live=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await live.route('**/*',route=>route.request().method()==='GET'?route.continue():route.abort());
  const response=await live.goto('https://dont-hit-game.onrender.com/',{waitUntil:'domcontentloaded',timeout:90000});
  assert.equal(response.status(),200);assert.equal(await live.title(),'RUSH TO ORBIT');
  console.log('Production baseline HTTP 200 and title verified, GET only');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
