const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,devices}=require('playwright');
const html=fs.readFileSync('index.html','utf8'),inject="window.__observeLane=()=>({running,playerPos,targetPos,laneStraddleTime,laneW,W,H,fuel,elapsed});draw()})();";
assert.equal(html.split('draw()})();').length,2);
(async()=>{const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{for(const device of ['iPhone 13','iPhone SE']){
const context=await browser.newContext({...devices[device],defaultBrowserType:'chromium'});try{
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.route('**/*',route=>{if(new URL(route.request().url()).pathname==='/reachability.txt')return route.fulfill({contentType:'text/plain',body:'rush-to-orbit-online-v1\n'});const u=route.request().url();if(u==='http://127.0.0.1:4173/')return route.fulfill({contentType:'text/html',body:html.replace('draw()})();',inject)});if(u.endsWith('/leaderboard.js'))return route.fulfill({contentType:'application/javascript',body:'window.rememberCampaign=()=>{};'});return route.abort()});
await page.goto('http://127.0.0.1:4173/');await page.locator('#play').tap();await page.waitForFunction(()=>window.__observeLane().running);
const cdp=await context.newCDPSession(page);const s=await page.evaluate(()=>window.__observeLane());const x=s.W/2,y=s.H*.78,half=s.laneW*.5/1.35;
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+half,y}]});
await page.waitForFunction(()=>{const s=window.__observeLane();return s.running&&Math.abs(s.playerPos-1.5)<.03&&s.laneStraddleTime>=.75},{},{timeout:4000});
await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+half*2,y}]});
await page.waitForFunction(()=>{const s=window.__observeLane();return s.running&&s.playerPos>1.9&&s.laneStraddleTime===0},{},{timeout:3000});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.deepEqual(errors,[]);console.log(device+': actual touch half-lane grace exceeded, lane-center reset verified (no game state writes)');
}finally{await context.close()}}}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
