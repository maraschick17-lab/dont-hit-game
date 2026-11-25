// Candidate-only instrumentation; never delivered to players or the production board.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium, devices } = require('playwright');
const candidate = fs.readFileSync('index.html','utf8');
const injection = "window.__qa={state:()=>({stage,running,airScroll,engineStage:engine?.stage,signature:engine?.sources.map(s=>Array.from(s.buffer.getChannelData(0).slice(200,208))),campaign:campaign.map(s=>s.stage),playerPos,targetPos}),complete:()=>{stageProgress=30},fail:()=>crash(true)};draw()})();";
assert.equal(candidate.split('draw()})();').length,2);
assert(!/selectedStage|worldsMenu|data-world|UNLOCK WORLDS/.test(candidate));
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.QA_CHROME_CHANNEL?{channel:process.env.QA_CHROME_CHANNEL}:{}),args:['--autoplay-policy=no-user-gesture-required']});
 try {
  for(const device of ['iPhone 13','iPhone SE']){
   const errors=[];
   const newScenario=async()=>{
   const context=await browser.newContext({...devices[device],defaultBrowserType:'chromium'});
   const page=await context.newPage();
   page.on('pageerror',e=>errors.push(String(e)));
   await page.route('**/*',async route=>{
    const url=route.request().url();
    if(url==='http://127.0.0.1:4173/'){return route.fulfill({contentType:'text/html',body:candidate.replace('draw()})();',injection)})}
    if(url==='http://127.0.0.1:4173/leaderboard.js'){return route.fulfill({contentType:'application/javascript',body:"window.rememberCampaign=c=>{window.__qaFinish=c};"})}
    return route.abort();
   });
   await page.addInitScript(()=>{if(location.origin!=='http://127.0.0.1:4173')return;localStorage.setItem('dh_world','3');localStorage.setItem('dh_worlds','[true,true,true,true]');localStorage.setItem('dh_bank','1000')});
   await page.goto('http://127.0.0.1:4173/');
   return {context,page};
   };
   let {context,page}=await newScenario();
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
   await cdp.detach();
   // Chromium can suppress the next synthetic tap after a CDP drag. Reset the
   // document between the steering and transition smoke scenarios.
   await context.close();
   ({context,page}=await newScenario());
   const tapStage=async(selector,expected)=>{
    const button=page.locator(selector);
    await button.waitFor({state:'visible'});
    // Allow the previous touch gesture and frame to settle before the next tap.
    await page.waitForTimeout(400);
    await button.tap();
    try{await page.waitForFunction(s=>window.__qa.state().stage===s&&window.__qa.state().running,expected,{timeout:3000});}
    catch(e){console.error(device,selector,'expected stage',expected,'actual',JSON.stringify(await state()),'panel',await page.locator('#box').innerText(),'page errors',errors);throw e;}
   };
   await tapStage('#play',0);
   const sig=[];
   // Exercise each real transition via the finish screen. Timing is advanced by
   // test-only instrumentation; this is a smoke test, not a full play-through.
   for(let s=0;s<4;s++){
    await page.waitForFunction(s=>window.__qa.state().stage===s&&window.__qa.state().running,s);
    const current=await state();console.log(device,'stage',s,'running',current.running);assert.equal(current.engineStage,s);sig.push(JSON.stringify(current.signature));
    if(s===2){const before=current.airScroll;await page.waitForFunction(before=>window.__qa.state().airScroll>before+3,before); }
    await page.evaluate(()=>window.__qa.complete());
    await page.locator('#nextstage').waitFor({state:'visible'});
    assert.deepEqual((await state()).campaign,Array.from({length:s+1},(_,i)=>i));
    if(s<3)await tapStage('#nextstage',s+1);
   }
   assert.equal(new Set(sig).size,4,'four distinct engine buffers');
   assert.match(await page.locator('#box h1').innerText(),/YOU WIN/);
   assert.deepEqual(await page.evaluate(()=>window.__qaFinish.map(s=>s.stage)),[0,1,2,3]);
   await tapStage('#nextstage',0);assert.equal((await state()).stage,0);
   await page.evaluate(()=>window.__qa.complete());await page.locator('#nextstage').waitFor({state:'visible'});await tapStage('#nextstage',1);
   assert.equal((await state()).stage,1);
   await page.evaluate(()=>window.__qa.fail());await tapStage('#again',0);assert.equal((await state()).stage,0);
   assert.equal(await page.evaluate(()=>localStorage.getItem('dh_world')),'3','legacy save untouched');
   assert.deepEqual(errors,[]);
   console.log(device+': touch steering, legacy saves, sequence, distinct audio buffers, air motion, victory and retry passed');
   await context.close();
  }

 // Real-duration campaign: only observe state, steer via actual touch events.
 // Unlike the transition smoke above, no progress, fuel, score, RNG, collision,
 // timing, spawn or vehicle state is changed by the harness.
 async function fullCampaign(browser) {
  const context=await browser.newContext({...devices['iPhone 13'],defaultBrowserType:'chromium'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  const observer="window.__observe=()=>({stage,running,stageProgress,fuel,elapsed,speed,playerPos,targetPos,playerY,W,H,laneW,objects:objects.map(o=>({lane:o.lane,y:o.y,type:o.type,closing:trafficClosingFactor(o),dest:o.dest})),campaign:campaign.map(s=>({...s}))});draw()})();";
  await page.route('**/*',async route=>{
   const url=route.request().url();
   if(url==='http://127.0.0.1:4173/')return route.fulfill({contentType:'text/html',body:candidate.replace('draw()})();',observer)});
   if(url==='http://127.0.0.1:4173/leaderboard.js')return route.fulfill({contentType:'application/javascript',body:"window.rememberCampaign=c=>{window.__observedFinish=c.map(s=>({...s}))};"});
   return route.abort();
  });
  try{
   await page.goto('http://127.0.0.1:4173/');
   await page.locator('#play').tap();
   const cdp=await context.newCDPSession(page);
   const state=()=>page.evaluate(()=>window.__observe());
   const pause=ms=>page.waitForTimeout(ms);
   for(let stage=0;stage<4;stage++){
    await page.waitForFunction(s=>window.__observe().running&&window.__observe().stage===s,stage);
    let s=await state(),x=s.W/2,y=s.H*.78;
    const started=Date.now();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    let previous=-1;
    while((s=await state()).running){
     assert(Date.now()-started<65000,'real-duration stage exceeded 65 seconds');
     const py=s.H*s.playerY;
     // Simulate a cautious player: prefer the spaces between lanes when not
     // collecting fuel. Estimate future gaps, including the steering path.
     const choices=[0,.5,1,1.5,2].map(p=>{
      let score=-.8*Math.abs(p-s.targetPos)+(p%1?.35:0);
      const rate=s.stage===0?13:22;
      for(const o of s.objects){
       const v=Math.max(1,s.speed*o.closing);
       if(o.type==='car'){
        for(let t=0;t<=.85;t+=.04){
         const player=p+(s.playerPos-p)*Math.exp(-rate*t);
         const gap=Math.abs(o.y+v*t-py);
         const lateral=Math.min(Math.abs(o.lane-player),o.dest===undefined?Infinity:Math.abs(o.dest-player));
         if(gap<58&&lateral<.40)score-=100*(1-t*.5);
        }
       }else{
        const eta=(py-o.y)/v;
        if(eta>=-.025&&eta<.85&&Math.abs(o.lane-p)<.15){
         const reachable=Math.abs(p-s.playerPos)*Math.exp(-rate*Math.max(0,eta))<.33;
         if(reachable)score+=(s.fuel<90?15:2)/(1+eta*2);
        }
       }
      }
      return {p,score};
     }).sort((a,b)=>b.score-a.score);
     const p=choices[0].p;
     if(Math.abs(p-s.targetPos)>.015){
      x+=(p-s.targetPos)*s.laneW/1.35;
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});
     }
     const tick=Math.floor(s.stageProgress/5);
     if(tick!==previous){previous=tick;console.log('Real campaign stage',stage,'progress',s.stageProgress.toFixed(1),'fuel',s.fuel.toFixed(1));}
     await pause(45);
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert(s.campaign.length===stage+1,'real campaign crashed at stage '+stage+' progress '+s.stageProgress.toFixed(2)+' fuel '+s.fuel.toFixed(2));
    assert(s.campaign[stage].seconds>=29.9,'stage was not completed in real game time');
    await page.locator('#nextstage').waitFor({state:'visible'});
    if(stage<3){await pause(450);await page.locator('#nextstage').click();}
   }
   assert.match(await page.locator('#box h1').innerText(),/YOU WIN/);
   const result=await page.evaluate(()=>window.__observedFinish);
   assert.deepEqual(result.map(s=>s.stage),[0,1,2,3]);
   assert(result.every(s=>s.seconds>=29.9));
   assert.deepEqual(errors,[]);
   console.log('Real-duration iPhone 13 campaign completed; game seconds',result.reduce((n,s)=>n+s.seconds,0).toFixed(2),'score',result.reduce((n,s)=>n+s.score,0),'no live score POST');
  }finally{await context.close()}
 }
 let fullError;
 for(let attempt=1;attempt<=2;attempt++){
  try{await fullCampaign(browser);fullError=undefined;break;}
  catch(e){fullError=e;console.error('Real campaign attempt',attempt,String(e));}
 }
 if(fullError)throw fullError;

  const live=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await live.route('**/*',route=>route.request().method()==='GET'?route.continue():route.abort());
  const response=await live.goto('https://dont-hit-game.onrender.com/',{waitUntil:'domcontentloaded',timeout:90000});
  assert.equal(response.status(),200);assert.equal(await live.title(),'RUSH TO ORBIT');
  console.log('Production baseline HTTP 200 and title verified, GET only');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
