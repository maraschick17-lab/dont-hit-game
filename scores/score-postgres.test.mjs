import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import pg from 'pg';
import {createBoard} from './server.js';
import {stageScoreBounds} from './score-limits.mjs';

// Intentionally no DATABASE_URL, environment secrets or production host.
// This port exists only on the disposable CI PostgreSQL service.
const refs = {
  web:'2211671ad76d8bc416ee5fe1fd30b2e49a83e0be',
  native:'d55c9f63b1791fffa1d9f6e2c3d15a5a18e25cb7'
};
function legacyClient(kind, endpoint, initials) {
  const source=execFileSync('git',['show',refs[kind]+':leaderboard.js'],{encoding:'utf8'});
  const captured=[], store=new Map(), input={value:initials}, submit={};
  const status={textContent:''};
  const form={elements:{initials:input},querySelector:()=>submit,append(){}};
  const list={replaceChildren(){},append(){}};
  const dialog={open:false,querySelector(s){return s==='form'?form:s==='ol'?list:s==='[role=status]'?status:{}}};
  const window={};
  let nativeSaved=null;
  if(kind==='native')window.rushNativePending={get:()=>nativeSaved,set:v=>{nativeSaved=v}};
  const document={querySelector:()=>dialog,createElement:()=>({}),addEventListener(){}};
  const localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  vm.runInNewContext(source,{window,document,localStorage,crypto:{randomUUID},AbortController,setTimeout,clearTimeout,
    fetch:async(url,opts)=>{
      assert.equal(url,'https://dont-hit-scores.onrender.com/scores');
      if(opts?.method==='POST')captured.push(JSON.parse(opts.body));
      return fetch(endpoint,opts); // only loopback, never production
    }},{filename:kind+'-leaderboard.js'});
  const stages=Array.from({length:4},(_,stage)=>({stage,seconds:30,score:stageScoreBounds(stage,30000).min+10}));
  window.rememberCampaign(stages);
  return {captured,status,post:()=>form.onsubmit({preventDefault(){}}),
    pending:()=>kind==='native'?nativeSaved:store.get('dh_pending_campaign')??null};
}
test('real PostgreSQL: legacy web/native clients, existing schema, retry, conflict and rankings',async t=>{
  const pool=new pg.Pool({host:'127.0.0.1',port:54329,user:'rto_fixture',
    password:'disposable_fixture_only',database:'rto_fixture',ssl:false,connectionTimeoutMillis:5000});
  t.after(()=>pool.end());
  assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name,'rto_fixture');
  // Start from the existing production schema shape, with a pre-existing row.
  // No DROP, ALTER, migration, or production connection.
  await pool.query('CREATE TABLE campaign_scores (id uuid PRIMARY KEY, initials varchar(3) NOT NULL, points integer NOT NULL, milliseconds integer NOT NULL)');
  await pool.query('CREATE INDEX campaign_ranking ON campaign_scores (points DESC, milliseconds ASC, id ASC)');
  const oldId=randomUUID();
  await pool.query('INSERT INTO campaign_scores VALUES ($1,$2,$3,$4)',[oldId,'OLD',1,120000]);
  const schema=()=>pool.query("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='campaign_scores' ORDER BY ordinal_position").then(r=>r.rows);
  const before=await schema();
  let failNextRank=false;
  const db={query:async(sql,args)=>{
    if(failNextRank&&sql.startsWith('SELECT position')){failNextRank=false;throw Error('isolated response failure after insert')}
    return pool.query(sql,args);
  }};
  const server=await createBoard(db);
  await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok)});
  t.after(()=>new Promise(ok=>server.close(ok)));
  const endpoint='http://127.0.0.1:'+server.address().port+'/scores';
  const send=run=>fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(run)});
  const count=async()=>Number((await pool.query('SELECT count(*) FROM campaign_scores')).rows[0].count);
  const web=legacyClient('web',endpoint,'WEB');
  const native=legacyClient('native',endpoint,'IOS');
  failNextRank=true;
  await web.post();
  assert.equal(await count(),2);
  assert.match(web.status.textContent,/saved for another try/);
  assert.ok(web.pending());
  await web.post();
  assert.deepEqual(web.captured[0],web.captured[1]);
  assert.equal(web.pending(),null);
  assert.equal(await count(),2);
  await native.post();
  assert.equal(native.pending(),null);
  assert.equal(await count(),3);
  for(const client of [web,native]){
    const run=client.captured[0];
    assert.deepEqual(Object.keys(run).sort(),['id','initials','stages']);
    assert.ok(run.stages.every(s=>Object.keys(s).sort().join(',')==='ms,score,stage'));
    const retry=await send(run);assert.equal(retry.status,200);
    assert.ok(Number.isInteger((await retry.json()).position));
  }
  const run=web.captured[0];
  for(const extra of [{mode:'daily'},{mode:'elite'},{mode:'endless'},{assisted:true},{unexpected:1}]){
    assert.equal((await send({...run,id:randomUUID(),...extra})).status,400);
  }
  assert.equal((await send({...run,initials:'NEW'})).status,409);
  assert.equal(await count(),3);
  const concurrent={...run,id:randomUUID(),initials:'CON',mode:'standard',assisted:false};
  const duplicates=await Promise.all([send(concurrent),send(concurrent),send(concurrent)]);
  assert.deepEqual(duplicates.map(r=>r.status),[200,200,200]);
  assert.equal(await count(),4);
  const listing=await fetch(endpoint);
  assert.equal(listing.status,200);
  const rows=await listing.json();
  const ranked=await pool.query('SELECT initials,points,milliseconds FROM campaign_scores ORDER BY points DESC,milliseconds ASC,id ASC');
  assert.deepEqual(rows,ranked.rows);
  assert.equal(rows.at(-1).initials,'OLD');
  assert.ok(rows.every(r=>Object.keys(r).sort().join(',')==='initials,milliseconds,points'));
  assert.deepEqual(await schema(),before);
  assert.equal((await pool.query("SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='campaign_ranking'")).rows[0].count,'1');
});
