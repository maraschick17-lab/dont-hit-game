const assert=require('node:assert/strict'),{test}=require('node:test'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
function makeSimulation(html){
 const destinations=html.slice(html.indexOf('const ORBIT_DESTINATIONS'),html.indexOf('let endless=null;'));
 const label=html.slice(html.indexOf('function orbitDestination'),html.indexOf('function rememberOrbit'));
 const code=html.slice(html.indexOf('function startEndless(){'),html.indexOf('function orbitPlanet'));
 return new Function('seed','mode','lane','H','turbo','limit',`
 let v=seed,Math=Object.create(globalThis.Math);Math.random=()=>((v=(Math.imul(v,1664525)+1013904223)>>>0)/4294967296);
 ${destinations}${label}
 let endless=null,running=false,stage=0,campaign=[],pid=null,tx=null,playerLane=1,playerPos=1,targetPos=1,playerY=.78,targetY=.78,combo=0,roadOffset=0,speed=340,fuel=100,elapsed=0,audio=null,last=0;
 const panel={style:{}},controls={style:{}},performance={now:()=>0};function orbitUnlocked(){return true}function rememberOrbit(){}function orbitSound(){}function sound(){}function laneX(x){return x}function requestAnimationFrame(){}function engineStart(){}function orbitLoop(){}
 ${code}
 startEndless();playerPos=targetPos=lane;pid=turbo?1:null;
 let reason='',steps=0,collected=0,prior=100,heavy=false,light=false,route=[],seen=new Set();
 while(!reason&&steps++<60*limit){
  let e=endless;
  if(mode==='skilled'){const c=e.cells.filter(c=>c.y<H*playerY-20).sort((a,b)=>b.y-a.y)[0];if(c)targetPos=c.lane;}
  if(mode==='ordinary'&&steps%180===0)targetPos=(targetPos+1)%3;
  playerPos+=(targetPos-playerPos)*(1-Math.exp(-22/60));
  reason=orbitStep(1/60);if(fuel>prior+.1)collected++;prior=fuel;
  for(const c of e.cells){if(!seen.has(c)){seen.add(c);route.push(c.lane)} if(c.y<H*playerY-35&&e.rocks.some(r=>r.lane===c.lane&&r.y<H*playerY+45))throw Error('fuel lane obstructed');}
  heavy||=e.rocks.some(r=>r.max>1);light||=e.rocks.some(r=>r.max===1);
 }
 return {time:Math.round(endless.time),distance:Math.round(endless.distance),reason:reason||'cap',collected,fuel:Math.round(fuel),destroyed:endless.destroyed,heavy,light,route};`);
}
const run=makeSimulation(html);
test('Endless route requires active steering and preserves reachable fuel',()=>{
 for(const h of [667,844])for(const turbo of [false,true])for(const seed of [1,2,7,42,2026]){
  const passive=[0,1,2].map(l=>run(seed,'passive',l,h,turbo,300));
  const ordinary=run(seed,'ordinary',1,h,turbo,300);
  const skill=run(seed,'skilled',1,h,turbo,300);
  for(const p of passive){assert(p.time<100,JSON.stringify(p));assert.notEqual(p.reason,'cap');}
  assert(skill.time>=240,JSON.stringify(skill));assert(skill.time>2*Math.max(...passive.map(p=>p.time)));
  assert(skill.collected>=60);assert(skill.heavy&&skill.light);assert(skill.destroyed>0);
  assert(skill.route.every((l,i)=>!i||Math.abs(l-skill.route[i-1])===1));
  console.log(JSON.stringify({h,turbo,seed,passive:passive.map(p=>p.time),ordinary:ordinary.time,skilled:skill.time}));
 }
});
test('stage finish copy and restart destination',()=>{assert(!html.includes('bonus coins'));assert(html.includes('Next destination:'));assert(html.includes('FLY AGAIN'));});
