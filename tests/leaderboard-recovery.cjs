const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('leaderboard.js','utf8');
const stages=n=>[0,1,2,3].map(stage=>({stage,score:n,seconds:30}));
function harness(seed=null,native=false){
  let saved=seed===null?null:JSON.stringify(seed), id=0;
  class El {
    constructor(){this.hidden=false;this.disabled=false;this.value='';this.children=[];this.textContent='';this.events={}}
    append(...nodes){this.children.push(...nodes)}
    replaceChildren(){this.children=[]}
    setAttribute(){}
    addEventListener(k,v){this.events[k]=v}
  }
  const input=new El(), submit=new El(), form=new El(), status=new El(), list=new El(), close=new El(), dialog=new El();
  form.elements={initials:input};form.querySelector=()=>submit;
  dialog.querySelector=q=>({'[role=status]':status,form,ol:list,'[data-close]':close}[q]);
  dialog.showModal=()=>{dialog.open=true};dialog.close=()=>{dialog.open=false;dialog.events.close?.()};
  const requests=[];let post=async()=>{throw Error('timeout')};
  const document={querySelector:()=>dialog,createElement:()=>new El(),addEventListener(){}};
  const window=native?{rushNativePending:{get:()=>saved,set:v=>{saved=v}}}:{};
  vm.runInNewContext(source,{window,document,localStorage:{getItem:()=>saved,setItem:(k,v)=>{saved=v},removeItem:()=>{saved=null}},crypto:{randomUUID:()=>String(++id)},fetch:async(url,opts)=>{requests.push(opts);return opts.method==='POST'?post():{ok:true,json:async()=>[]}},AbortController,setTimeout:()=>0,clearTimeout(){}});
  return {window,input,submit,form,status,dialog,requests,discard:form.children[2],cancel:form.children[3],saved:()=>JSON.parse(saved),setPost:fn=>{post=fn},submitNow:()=>form.onsubmit({preventDefault(){}})};
}
test('failed POST survives new campaign and retries identical payload',async()=>{
 const h=harness();h.window.rememberCampaign(stages(1000));h.input.value='MM';await h.submitNow();
 const before=h.saved();h.window.rememberCampaign(stages(1200));assert.deepEqual(h.saved(),before);
 await h.submitNow();assert.equal(h.requests.length,2);assert.equal(h.requests[0].body,h.requests[1].body);
 assert.match(h.discard.textContent,/NEWER/);
});
test('discard requires explicit confirmation and never makes a request',async()=>{
 const h=harness();h.window.rememberCampaign(stages(1000));h.discard.onclick();assert.ok(h.saved());assert.equal(h.submit.disabled,true);
 await h.submitNow();assert.equal(h.requests.length,0);
 h.cancel.onclick();assert.ok(h.saved());assert.equal(h.submit.disabled,false);
 h.discard.onclick();h.discard.onclick();assert.equal(h.saved(),null);assert.equal(h.requests.length,0);assert.equal(h.form.hidden,true);
});
test('replacing earlier attempt promotes newer finish without submitting it',async()=>{
 const h=harness();h.window.rememberCampaign(stages(1000));h.input.value='A';await h.submitNow();
 h.window.rememberCampaign(stages(1200));h.discard.onclick();h.discard.onclick();
 assert.equal(h.saved().stages[0].score,1200);assert.equal(h.saved().initials,undefined);assert.equal(h.input.value,'');assert.equal(h.requests.length,1);
});
test('successful retry promotes newer finish, no automatic second POST',async()=>{
 const h=harness();h.window.rememberCampaign(stages(1000));h.input.value='A';await h.submitNow();
 h.window.rememberCampaign(stages(1200));h.setPost(async()=>({ok:true,json:async()=>({position:1})}));await h.submitNow();
 assert.equal(h.saved().stages[0].score,1200);assert.equal(h.requests.length,2);assert.equal(h.requests[0].body,h.requests[1].body);
});
test('in-flight POST prevents discard and newer finish cannot overwrite it',async()=>{
 const h=harness();h.window.rememberCampaign(stages(1000));h.input.value='A';let done;h.setPost(()=>new Promise(resolve=>{done=resolve}));const p=h.submitNow();
 const before=h.saved();h.window.rememberCampaign(stages(1200));h.discard.onclick();assert.deepEqual(h.saved(),before);assert.equal(h.discard.disabled,true);
 done({ok:true,json:async()=>({position:1})});await p;assert.equal(h.saved().stages[0].score,1200);
});
test('native adapter discard persists null, and reloading cannot restore retry',async()=>{
 const seed={id:'old',initials:'QA',stages:stages(1000).map(s=>({stage:s.stage,score:s.score,ms:30000}))};
 const h=harness(seed,true);h.discard.onclick();h.discard.onclick();assert.equal(h.saved(),null);assert.equal(h.requests.length,0);
 const next=harness(h.saved(),true);assert.equal(next.form.hidden,true);
});
test('unattempted finish can be replaced and invalid campaign cannot replace it',()=>{
 const h=harness();h.window.rememberCampaign(stages(1000));h.window.rememberCampaign(stages(1200));
 assert.equal(h.saved().stages[0].score,1200);h.window.rememberCampaign(stages(1000).slice(0,3));assert.equal(h.saved().stages[0].score,1200);
});
test('rejection retains attempted run until player decides, no automatic retry',async()=>{
 const h=harness();h.window.rememberCampaign(stages(1000));h.input.value='A';h.setPost(async()=>({status:400,ok:false}));await h.submitNow();assert.equal(h.saved().initials,'A');assert.match(h.status.textContent,/rejected/);assert.equal(h.requests.length,1);
});
