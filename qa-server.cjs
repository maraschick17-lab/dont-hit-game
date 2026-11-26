'use strict';
const fs=require('node:fs'),http=require('node:http'),crypto=require('node:crypto'),path=require('node:path');
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
  replace("appendEndlessButton();document.querySelector('#left').onclick", "appendEndlessButton();document.querySelector('#left').onclick");
  replace('});draw()})();','});draw();showQAMenu()})();');
  const qa=String.raw