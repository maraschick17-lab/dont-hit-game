// Debug-only CI asset transformation. Never modify checked-in or Release HTML.
const fs = require('node:fs'), assert = require('node:assert/strict');
const path = process.argv[2];
assert(path && path.endsWith('/App/Web/index.html'));
const html = fs.readFileSync(path,'utf8'), marker = 'draw()})();';
assert.equal(html.split(marker).length,2);
assert(!html.includes('__nativeCampaignQAEnabled'));
const driver = `
if(window.__nativeCampaignQAEnabled === true){
  const qaPointer=9173, originalCapture=canvas.setPointerCapture.bind(canvas);
  // The simulated pointer is not registered in the native pointer table.
  canvas.setPointerCapture=id=>{if(id!==qaPointer)originalCapture(id)};
  let qaStage=-1, qaX=0, qaY=0;
  function qaEvent(type){
    canvas.dispatchEvent(new PointerEvent(type,{pointerId:qaPointer,pointerType:'touch',isPrimary:true,bubbles:true,clientX:qaX,clientY:qaY,buttons:type==='pointerup'?0:1}));
  }
  setInterval(()=>{
    if(!running||endless){
      if(qaStage!==-1){qaEvent('pointerup');qaStage=-1}
      return;
    }
    if(qaStage!==stage){
      if(qaStage!==-1)qaEvent('pointerup');
      qaStage=stage;qaX=W/2;qaY=H*.78;qaEvent('pointerdown');
    }
    const py=H*playerY, rate=stage===0?13:22;
    const choices=[0,.5,1,1.5,2].map(p=>{
      let value=-.8*Math.abs(p-targetPos)+(p%1?.35:0);
      for(const o of objects){
        const v=Math.max(1,speed*trafficClosingFactor(o));
        if(o.type==='car'){
          for(let t=0;t<=.85;t+=.04){
            const pos=p+(playerPos-p)*Math.exp(-rate*t);
            const lateral=Math.min(Math.abs(o.lane-pos),o.dest===undefined?Infinity:Math.abs(o.dest-pos));
            if(Math.abs(o.y+v*t-py)<58&&lateral<.40)value-=100*(1-t*.5);
          }
        }else{
          const eta=(py-o.y)/v;
          if(eta>=-.025&&eta<.85&&Math.abs(o.lane-p)<.15&&Math.abs(p-playerPos)*Math.exp(-rate*Math.max(0,eta))<.33)
            value+=(fuel<90?15:2)/(1+eta*2);
        }
      }
      return {p,value};
    }).sort((a,b)=>b.value-a.value);
    const p=choices[0].p;
    if(Math.abs(p-targetPos)>.015){qaX+=(p-targetPos)*laneW/1.35;qaEvent('pointermove')}
  },45);
}
`;
fs.writeFileSync(path,html.replace(marker,driver+marker));
console.log('Native simulator driver inserted; Release asset untouched.');
