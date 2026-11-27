const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium,devices}=require('playwright');
const html=fs.readFileSync('index.html','utf8');
const injection="window.__networkQA={state:()=>({running,networkPaused,stage,elapsed,stageProgress,fuel,score,playerPos,targetPos,orbit:endless&&{time:endless.time,distance:endless.distance,score:endless.score}}),complete:()=>{stageProgress=30},safe:()=>{objects=[];spawn=100}};draw()})();";
(async()=>{const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{for(const device of ['iPhone 13','iPhone SE']){
 const context=await browser.newContext({...devices[device],defaultBrowserType:'chromium'}),page=await context.newPage(),errors=[];let status='portal',probes=0;
 page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://127.0.0.1:4173')return route.abort();
 if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:html.replace('draw()})();',injection)});
 if(u.pathname==='/leaderboard.js')return route.fulfill({contentType:'application/javascript',body:'window.rememberCampaign=()=>{};'});
 if(u.pathname==='/reachability.txt'){probes++;if(status==='down')return route.abort();return route.fulfill({contentType:'text/plain',body:status==='ok'?'rush-to-orbit-online-v1\n':'captive portal'})}
 return route.abort()});
 const state=()=>page.evaluate(()=>window.__networkQA.state()),wait=()=>page.waitForFunction(()=>!document.querySelector('#networkRetry').disabled),retry=()=>page.locator('#networkRetry').click();
 await page.goto('http://127.0.0.1:4173/');
 await page.locator('#play').click();await wait();assert.equal((await state()).running,false);assert.match(await page.locator('#networkStatus').innerText(),/Wi-Fi/);
 await page.locator('#networkCancel').click();assert.equal(await page.locator('#networkGate').isVisible(),false);
 await page.locator('#garage').click();await page.locator('#back').click();
 status='down';await page.locator('#go').click();await wait();assert.equal((await state()).running,false);
 status='ok';await retry();await page.waitForFunction(()=>window.__networkQA.state().running);
 await page.evaluate(()=>window.__networkQA.safe());await page.waitForTimeout(250);
 await context.setOffline(true);await page.waitForFunction(()=>window.__networkQA.state().networkPaused);
 const before=await state();await page.waitForTimeout(350);assert.deepEqual(await state(),before,'paused metrics and position frozen');
 await retry();await wait();assert.equal((await state()).networkPaused,true);
 await context.setOffline(false);await retry();await page.waitForFunction(()=>!window.__networkQA.state().networkPaused);await page.waitForTimeout(200);
 assert((await state()).elapsed>before.elapsed);assert((await state()).elapsed-before.elapsed<1,'no catch-up time');
 await page.evaluate(()=>window.__networkQA.complete());await page.locator('#nextstage').waitFor({state:'visible'});
 status='down';await page.locator('#nextstage').click();await wait();assert.equal((await state()).stage,0);assert.equal((await state()).running,false);
 status='ok';await retry();await page.waitForFunction(()=>window.__networkQA.state().stage===1&&window.__networkQA.state().running);
 for(let s=1;s<=3;s++){await page.evaluate(()=>window.__networkQA.complete());await page.locator('#nextstage').waitFor({state:'visible'});if(s<3){await page.locator('#nextstage').click();await page.waitForFunction(n=>window.__networkQA.state().stage===n&&window.__networkQA.state().running,s+1)}}
 status='down';await page.locator('#endless').click();await wait();assert.equal((await state()).running,false);
 status='ok';await retry();await page.waitForFunction(()=>window.__networkQA.state().orbit?.time>0);
 await context.setOffline(true);await page.waitForFunction(()=>window.__networkQA.state().networkPaused);
 const orbitBefore=await state();await page.waitForTimeout(350);assert.deepEqual(await state(),orbitBefore);
 await context.setOffline(false);await retry();await page.waitForFunction(()=>!window.__networkQA.state().networkPaused&&window.__networkQA.state().orbit.time>0);
 assert(probes>=8);assert.deepEqual(errors,[]);await context.close();
 console.log(device+': captive portal, outage, offline menus, frozen campaign and Endless Orbit, reconnect, stage gate, no external ad dependency passed');
}}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
