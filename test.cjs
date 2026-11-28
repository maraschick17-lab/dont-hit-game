const {test}=require('node:test'), assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(process.argv[1].replace(/test\.cjs$/, 'leaderboard.js'),'utf8');
const stages=[0,1,2,3].map(stage=>({stage,score:1000,seconds:30}));
function setup(storage=new Map(),responses=[]){
 const status={},input={value:'abc'},submit={},list={replaceChildren(){},append(){}};
 const form={elements:{initials:input},append(){},querySelector(){return submit}};
 const dialog={open:false,querySelector(q){return {'[role=status]':status,form,ol:list,'[data-close]':{}}[q]},showModal(){this.open=true},addEventListener(){}};
 const calls=[],window={};let click;
 const context={window,document:{querySelector(){return dialog},createElement(){return {setAttribute(){}}},addEventListener(_,fn){click=fn}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:{randomUUID:()=> 'id-1'},AbortController,setTimeout,clearTimeout,fetch:async(url,opts)=>{calls.push(opts);const next=responses.shift();if(next instanceof Error)throw next;return next||{ok:true,json:async()=>[]}}};
 vm.runInNewContext(source,context);
 return {window,form,input,submit,status,calls,storage,open:()=>click({target:{closest:()=>true}})};
}
const ev={preventDefault(){}};
test('ambiguous POST retries same ID and initials after reload without AbortSignal.timeout',async()=>{
 const a=setup(new Map(),[new Error('offline')]);a.window.rememberCampaign(stages);a.input.value='abc';await a.form.onsubmit(ev);
 assert.equal(a.input.readOnly,true);assert.equal(JSON.parse(a.storage.get('dh_pending_campaign')).initials,'ABC');assert.match(a.status.textContent,/saved/);
 const b=setup(a.storage,[{ok:true,json:async()=>({position:1})}]);b.input.value='XYZ';await b.form.onsubmit(ev);
 assert.equal(b.calls[0].body,a.calls[0].body);assert.equal(b.storage.has('dh_pending_campaign'),false);
});
test('rejected score is not silently discarded',async()=>{const a=setup(new Map(),[{ok:false,status:400}]);a.window.rememberCampaign(stages);a.input.value='abc';await a.form.onsubmit(ev);assert.match(a.status.textContent,/rejected/);assert.equal(a.storage.has('dh_pending_campaign'),true)});
test('malformed success retains saved campaign',async()=>{const a=setup(new Map(),[{ok:true,json:async()=>({position:0})}]);a.window.rememberCampaign(stages);a.input.value='abc';await a.form.onsubmit(ev);assert.equal(a.storage.has('dh_pending_campaign'),true)});
test('invalid initials never POST',async()=>{const a=setup();a.window.rememberCampaign(stages);a.input.value='!';await a.form.onsubmit(ev);assert.equal(a.calls.length,0)});
test('concurrent submit guarded',async()=>{const a=setup();a.window.rememberCampaign(stages);a.input.value='abc';await Promise.all([a.form.onsubmit(ev),a.form.onsubmit(ev)]);assert.equal(a.calls.length,1)});
