const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium,devices}=require('playwright');
const html=fs.readFileSync('index.html','utf8');
const injection="window.__orbitQA={complete:()=>{stageProgress=30},state:()=>({running,stage,unlocked:orbitUnlocked(),endless:endless&&{...endless,fuel},playerPos,targetPos,records:orbitRecords(),livery:orbitLivery().id}),advance:()=>{endless.distance=16;orbitStep(.02)},hit:()=>{endless.rocks=[{lane:playerPos,y:H*playerY-100,oldY:H*playerY-100,hp:1,max:1,angle:0}];endless.shots=[{x:playerPos,y:H*playerY-75}];orbitStep(.04)},drain:()=>{fuel=0}};draw()})();";
(async()=>{const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{for(const device of ['iPhone 13','iPhone SE']){
 const context=await browser.newContext({...devices[device],defaultBrowserType:'chromium',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/*',route=>{if(new URL(route.request().url()).pathname==='/reachability.txt')return route.fulfill({contentType:'text/plain',body:'rush-to-orbit-online-v1\n'});const url=route.request().url();if(url==='http://127.0.0.1:4173/')return route.fulfill({contentType:'text/html',body:html.replace('draw()})();',injection)});if(url.endsWith('/leaderboard.js'))return route.fulfill({contentType:'application/javascript',body:'window.rememberCampaign=c=>{window.__campaignPosts=(window.__campaignPosts||0)+1};'});return route.abort()});
 await page.goto('http://127.0.0.1:4173/');assert.equal(await page.locator('#endless').count(),0);
 await page.locator('#play').click();for(let s=0;s<4;s++){await page.waitForFunction(s=>window.__orbitQA.state().stage===s&&window.__orbitQA.state().running,s);await page.evaluate(()=>window.__orbitQA.complete());await page.locator('#nextstage').waitFor({state:'visible'});if(s<3){assert.doesNotMatch(await page.locator('#box').innerText(),/coins/i);await page.locator('#nextstage').click()}}
 assert.match(await page.locator('#box h1').innerText(),/ORBIT ACHIEVED/);assert.equal(await page.evaluate(()=>window.__campaignPosts),1);
 await page.locator('#endless').click();await page.waitForFunction(()=>window.__orbitQA.state().endless?.shots.length>0);
 await page.evaluate(()=>window.__orbitQA.hit());await page.waitForFunction(()=>window.__orbitQA.state().endless.destroyed>=1);
 await page.evaluate(()=>window.__orbitQA.advance());await page.waitForFunction(()=>window.__orbitQA.state().endless.region===1);
 let state=await page.evaluate(()=>window.__orbitQA.state());assert.equal(state.endless.label,'THE MOON');assert(state.records.destination>=1);assert(state.endless.fuel<100);
 await page.evaluate(()=>window.__orbitQA.drain());await page.locator('#endless').waitFor({state:'visible'});assert.match(await page.locator('#box h1').innerText(),/OUT OF FUEL/);assert.match(await page.locator('#box').innerText(),/Next destination:/);
 assert.equal(await page.evaluate(()=>window.__campaignPosts),1);
 await page.locator('#orbitGarage').click();
 assert(await page.locator('[data-livery="mars"]').isDisabled());
 assert.equal(await page.locator('[data-livery="lunar"]').isDisabled(),false);
 await page.locator('[data-livery="lunar"]').click();
 assert.equal(await page.evaluate(()=>window.__orbitQA.state().livery),'lunar');
 assert.equal(await page.locator('[data-livery="lunar"]').getAttribute('aria-pressed'),'true');
 await page.locator('#endless').click();await page.waitForFunction(()=>window.__orbitQA.state().running);
 await page.evaluate(()=>window.__orbitQA.drain());await page.locator('#orbitGarage').waitFor({state:'visible'});
 await page.reload();assert.equal(await page.evaluate(()=>window.__orbitQA.state().livery),'lunar');assert.equal(await page.locator('#endless').count(),1);
 assert((await page.evaluate(()=>window.__orbitQA.state())).records.destroyed>=1);assert.deepEqual(errors,[]);console.log(device+': unlock, cannon, asteroid hit, milestone, depletion, records and reload passed');await context.close();
}}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});