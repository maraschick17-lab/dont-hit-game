import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createBoard} from './server.js';
import {stageScoreBounds} from './score-limits.mjs';
// No production database or network access: in-memory fixture and loopback HTTP.
function fixture(){
  const rows=new Map();let fail=false,inserts=0;
  const ordered=()=>[...rows.values()].sort((a,b)=>b.points-a.points||a.milliseconds-b.milliseconds||a.id.localeCompare(b.id));
  return {rows,get inserts(){return inserts},failNextRank(){fail=true},
    async query(sql,args){
      if(sql.startsWith('CREATE '))return {rows:[]};
      if(sql.startsWith('INSERT INTO campaign_scores')){
        inserts++;const [id,initials,points,milliseconds]=args;
        if(!rows.has(id))rows.set(id,{id,initials,points,milliseconds});
        return {rows:[]};
      }
      if(sql.startsWith('SELECT position')){
        if(fail){fail=false;throw Error('fixture outage')}
        return {rows:ordered().map((row,i)=>({...row,position:i+1})).filter(row=>row.id===args[0])};
      }
      if(sql.startsWith('SELECT initials'))return {rows:ordered().slice(0,25).map(({initials,points,milliseconds})=>({initials,points,milliseconds}))};
      throw Error('unexpected query');
    }};
}
function run(){return {id:randomUUID(),initials:'QA1',stages:Array.from({length:4},(_,stage)=>({stage,ms:30000,score:stageScoreBounds(stage,30000).min+10}))}}
test('isolated HTTP: malformed scores, mode separation, retry and ranking',async t=>{
  const db=fixture(),server=await createBoard(db);
  await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok)});
  t.after(()=>new Promise(ok=>server.close(ok)));
  const endpoint='http://127.0.0.1:'+server.address().port+'/scores';
  const send=(body,headers={'Content-Type':'application/json'})=>fetch(endpoint,{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)});
  const good=run();
  for(const bad of [null,[],{}, {...good,initials:'<A>'},{...good,id:'no'},
    {...good,stages:good.stages.slice(0,3)}, {...good,stages:[...good.stages].reverse()},
    {...good,stages:good.stages.map(s=>({...s,score:50000}))},
    {...good,stages:good.stages.map(s=>({...s,ms:1}))},
    {...good,stages:good.stages.map(s=>({...s,score:String(s.score)}))},
    {...good,stages:good.stages.map(s=>({...s,assisted:true}))},
    {...good,mode:'daily'}, {...good,mode:'elite'}, {...good,mode:'endless'},
    {...good,assisted:true}, {...good,assisted:'false'}, {...good,extra:'unexpected'}])
      assert.equal((await send(bad)).status,400);
  assert.equal((await send('{')).status,400);
  assert.equal((await send('x'.repeat(2049))).status,413);
  assert.equal((await send(good,{'Content-Type':'text/plain'})).status,415);
  assert.equal(db.inserts,0);
  db.failNextRank();
  assert.equal((await send(good)).status,503);
  assert.equal(db.rows.size,1);
  const retry=await send(good);
  assert.equal(retry.status,200);assert.deepEqual(await retry.json(),{position:1});
  assert.equal(db.rows.size,1);
  assert.equal((await send({...good,initials:'QA2'})).status,409);
  assert.equal(db.rows.size,1);
  const better=run();better.initials='QA2';better.stages[0].score+=10;
  const second=await send({...better,mode:'standard',assisted:false});
  assert.equal(second.status,200);assert.deepEqual(await second.json(),{position:1});
  const listing=await fetch(endpoint);assert.equal(listing.status,200);
  assert.equal(listing.headers.get('access-control-allow-origin'),'https://dont-hit-game.onrender.com');
  const list=await listing.json();
  assert.deepEqual(list.map(s=>s.initials),['QA2','QA1']);
  assert.deepEqual(Object.keys(list[0]).sort(),['initials','milliseconds','points']);
  assert.equal(db.rows.size,2);
});
