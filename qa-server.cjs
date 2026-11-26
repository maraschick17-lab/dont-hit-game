'use strict';
const fs=require('node:fs'),http=require('node:http'),crypto=require('node:crypto'),path=require('node:path');
function showQAMenu(){
  panel.style.display='flex';
  box.innerHTML='<div id="qaList"><h1>RUSH TO ORBIT</h1><p><strong>OWNER QA · v4.14</strong><br>Direct stage access. No production saves, scores, ads or purchases.</p><button data-qa-stage="0">1 · HIGHWAY</button><button data-qa-stage="1">2 · SPEEDBOAT</button><button data-qa-stage="2">3 · AIRPLANE</button><button data-qa-stage="3">4 · ROCKET</button><button id="qaVictory" class="alt">VICTORY ANIMATION</button><button id="qaEndless">ENDLESS ORBIT ∞</button><label><p>Jump to an orbital arrival</p><select id="qaDestination">'+ORBIT_DESTINATIONS.map((d,i)=>'<option value="'+i+'">'+d.name+'</option>').join('')+'<option value="galaxy2">GALAXY 2</option><option value="galaxy3">GALAXY 3</option></select></label><button id="qaJump" class="alt">TEST SELECTED DESTINATION</button><p>Use STAGE SELECT at any time to reset this test session.</p></div>';
  box.querySelectorAll('[data-qa-stage]').forEach(b=>b.onclick=()=>{campaign=[];endless=null;startStage(Number(b.dataset.qaStage))});
  box.querySelector('#qaVictory').onclick=()=>{campaign=[0,1,2,3].map(stage=>({stage,score:1000,seconds:30}));try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();audio.resume()}catch{}campaignVictory(1000);panel.style.display='flex';};
  function enterOrbit(destination){save('rto_endless_unlocked_v1',true);startEndless();if(destination===undefined||destination==='0')return;let n=Number(destination),at=destination==='galaxy2'?520:destination==='galaxy3'?610:ORBIT_DESTINATIONS[n].at;endless.distance=at-.05;endless.region=orbitDestination(endless.distance);endless.label=orbitLabel(endless.region,endless.distance);endless.arrival=0;}
  box.querySelector('#qaEndless').onclick=()=>enterOrbit();
  box.querySelector('#qaJump').onclick=()=>enterOrbit(box.querySelector('#qaDestination').value);
  document.querySelector('#qaHome').onclick=()=>location.reload();
}
function buildQA(source){
  function replace(old,next){if(!source.includes(old))throw new Error('QA source anchor missing: '+old.slice(0,70));source=source.replace(old,next)}
  replace('<title>RUSH TO ORBIT</title>','<title>RUSH TO ORBIT — OWNER QA</title>');
  replace('<link rel="icon" type="image/svg+xml" href="icon.svg"><link rel="manifest" href="manifest.webmanifest">','');
  replace('<script src="leaderboard.js"></script>','');
  source=source.replace(/<button[^>]*data-scores[^>]*>[^<]*<\/button>/g,'');
  replace('window.rememberCampaign(campaign);','');
  replace("const read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};","const qaStore=new Map();const read=(k,d)=>qaStore.has(k)?JSON.parse(qaStore.get(k)):d,save=(k,v)=>qaStore.set(k,JSON.stringify(v));");
  replace('</style>', '#qaBadge{position:fixed;z-index:8;bottom:calc(env(safe-area-inset-bottom,0px) + 3px);left:7px;font:700 11px system-ui;color:#ffdf55;pointer-events:none}#qaHome{position:fixed;z-index:9;bottom:calc(env(safe-area-inset-bottom,0px) + 4px);right:7px;width:auto;padding:8px 12px;font-size:12px;margin:0;background:#26324b;color:white;touch-action:manipulation}#qaList button{font-size:15px;padding:10px 14px;margin-top:6px}#qaList select{width:100%;padding:12px;font-size:16px;border-radius:9px;background:#333c53;color:white;margin-top:10px}#qaList p{font-size:13px;margin:8px 0}#qaList h1{font-size:30px}#box{max-height:calc(100dvh - 70px)}</style>');
  replace('<canvas id="game"></canvas>','<canvas id="game"></canvas><div id="qaBadge">OWNER QA · NOT RANKED</div><button id="qaHome" type="button">STAGE SELECT ↻</button>');
  replace('});draw()})();','});draw();showQAMenu()})();');
  replace('function start(){',showQAMenu.toString()+'\nfunction start(){');
  if(/localStorage|sessionStorage|leaderboard\.js|window\.rememberCampaign|data-scores/.test(source))throw new Error('Production integration remains in QA');
  return source;
}
const CSP="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
function createServer(html,password){
 if(typeof password!=='string'||password.length<24)throw new Error('QA_PASSWORD must be configured (24+ characters)');
 const expected=Buffer.from('Basic '+Buffer.from('owner:'+password).toString('base64'));
 return http.createServer((req,res)=>{
   const given=Buffer.from(req.headers.authorization||'');
   res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',CSP);
   if(given.length!==expected.length||!crypto.timingSafeEqual(given,expected)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Rush to Orbit owner QA", charset="UTF-8"','Content-Type':'text/plain; charset=utf-8'});return res.end('Owner QA authentication required.')}
   if(!['GET','HEAD'].includes(req.method)||!['/','/index.html'].includes(req.url.split('?')[0])){res.writeHead(404);return res.end();}
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(req.method==='HEAD'?'':html);
 });
}
module.exports={buildQA,createServer};
if(require.main===module){const html=buildQA(fs.readFileSync(path.join(__dirname,'index.html'),'utf8'));if(process.argv.includes('--export'))process.stdout.write(html);else createServer(html,process.env.QA_PASSWORD).listen(Number(process.env.PORT)||3000,'0.0.0.0');}
