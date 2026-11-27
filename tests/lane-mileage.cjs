const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const code=html.slice(html.indexOf('const LANE_STRADDLE_GRACE='),html.indexOf('const TRAFFIC_SPEED_RATIO='));
assert(code.includes('function laneStraddleBurnMultiplier'));
function setup(){const c=vm.createContext({Math});vm.runInContext(code,c);return c}
function burn(c,stage,pos,seconds,rate,progress=10){let total=0;for(let t=0;t<seconds-1e-9;){let dt=Math.min(.02,seconds-t);total+=dt*rate*c.laneStraddleBurnMultiplier(stage,pos,dt,progress);t+=dt}return total}
test('sustained gap incurs small proportional normal and turbo fuel penalty after grace',()=>{for(const s of [0,1,2])for(const rate of [4.8,8.5,1.5,3.36])for(const p of [.5,1.5]){const actual=burn(setup(),s,p,4,rate);assert.ok(Math.abs(actual-rate*(4+.10*3.25))<1e-8);assert(actual<rate*4*1.10)}});
test('ordinary smooth lane transition does not cost extra fuel',()=>{for(const rate of [13,22]){const c=setup();let pos=0;for(let i=0;i<50;i++){pos+=(1-pos)*(1-Math.exp(-rate*.02));assert.equal(c.laneStraddleBurnMultiplier(0,pos,.02,10),1)}}});
test('grace resets after returning to center and at stage start',()=>{const c=setup();assert.ok(Math.abs(burn(c,0,.5,.6,4.8)-2.88)<1e-8);assert.equal(c.laneStraddleBurnMultiplier(0,1,.02,10),1);assert.ok(Math.abs(burn(c,0,1.5,.6,4.8)-2.88)<1e-8);assert.match(html,/function startStageNow\(nextStage\)\{if\(running\)return;laneStraddleTime=0;/)});
test('rocket and protected finish keep baseline economy even after sustained gap',()=>{for(const [stage,progress] of [[3,10],[0,27],[1,29],[2,29]]){const c=setup();burn(c,0,.5,3,4.8);assert.ok(Math.abs(burn(c,stage,.5,4,4.8,progress)-19.2)<1e-8);assert.equal(c.laneStraddleBurnMultiplier(0,.5,.02,10),1)}});
test('frame duration independence and centered lane baseline',()=>{for(const dt of [.01,.016,.025,.04]){const c=setup();let total=0,t=0;while(t<3-1e-9){let d=Math.min(dt,3-t);total+=d*c.laneStraddleBurnMultiplier(2,.5,d,10);t+=d}assert.ok(Math.abs(total-3.225)<1e-8)}for(const p of [0,1,2,.2,.8,1.2,1.8])assert.ok(Math.abs(burn(setup(),0,p,4,8.5)-34)<1e-8)});
