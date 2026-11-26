'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,devices}=require('playwright');
const {buildQA,createServer}=require('../qa-server.cjs');
(async()=>{
 const html=buildQA(fs.readFileSync('index.html','utf8'));
 assert(!html.includes('localStorage'));assert(!html.includes('leaderboard.js'));assert(!html.includes('data-scores'));
 assert.throws(()=>createServer(html,''));const password='test-only-not-a-real-password-1234';
 const server=createServer(html,password);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  const unauth=await fetch(url);assert.equal(unauth.status,401);assert(!(await unauth.text()).includes('qaList'));
  const bad=await fetch(url,{headers:{Authorization:'Basic '+Buffer.from('owner:wrong').toString('base64')}});assert.equal(bad.status,401);
  const good=await fetch(url,{headers:{Authorization:'Basic '+Buffer.from('owner:'+password).toString('base64')}});assert.equal(good.status,200);assert.match(good.headers.get('content-security-policy'),/connect-src 'none'/);
  browser=await chromium.launch({headless:true});
  for(const device of ['iPhone 13','iPhone SE']){
   const context=await browser.newContext({...devices[device],defaultBrowserType:undefined,httpCredentials:{username:'owner',password}});
   await context.addInitScript(()=>{window.qaCanvasLabels=[];const old=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(t,...a){window.qaCanvasLabels.push(String(t));if(window.qaCanvasLabels.length>300)window.qaCanvasLabels.splice(0,100);return old.call(this,t,...a)}});
   const page=await context.newPage(),errors=[],external=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(url+'/'))external.push(r.url())});
   await context.route('**/*',route=>route.request().url().startsWith(url+'/')?route.continue():route.abort());
   await page.goto(url);
   async function until(fn,label){for(let n=0;n<100;n++){if(await fn())return;await new Promise(r=>setTimeout(r,50))}throw Error('Missing '+label)}
   async function reset(){await page.locator('#qaHome').tap();await page.locator('#qaList').waitFor({state:'visible'});}
   for(const [i,label] of ['ROAD','SEA','AIR','SPACE'].entries()){
    await page.locator('[data-qa-stage="'+i+'"]').tap();await until(async()=> (await page.locator('#score').textContent()).startsWith(label),label);
    assert.equal(await page.locator('#panel').isVisible(),false);await reset();
   }
   await page.locator('#qaVictory').tap();await page.getByText('ORBIT ACHIEVED — YOU WIN!').waitFor();await page.locator('#endless').tap();await until(async()=> (await page.locator('#score').textContent()).startsWith('ORBIT'),'ORBIT');await reset();
   await page.locator('#qaEndless').tap();await until(async()=> (await page.locator('#score').textContent()).startsWith('ORBIT'),'ORBIT');await reset();
   const opts=await page.locator('#qaDestination option').evaluateAll(a=>a.map(x=>[x.value,x.textContent]));
   for(const [value,label] of opts){
    await page.locator('#qaDestination').selectOption(value);await page.locator('#qaJump').tap();
    await until(()=>page.evaluate(l=>window.qaCanvasLabels.includes(l),label),label);
    await reset();
   }
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(await page.evaluate(()=>localStorage.length),0);
   console.log(device+': 4 stages, victory, Endless, '+opts.length+' destination selections and clean resets passed; no network calls or production writes');
   await context.close();
  }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
