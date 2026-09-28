const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/load-training.cjs'),{fixture}=require('./helpers/training-fixture.cjs');
test('unavailable database reports failure instead of silently falling back',async()=>{
 const {TrainingStorage:S}=load(['training-schema.js','training-storage.js']);await assert.rejects(S.open({indexedDB:null}),e=>e.code==='UNAVAILABLE');
});
test('repository waits for transaction completion and rejects abort after request success',async()=>{
 let stored=fixture(),transactions=[];
 const connection={objectStoreNames:{contains:()=>true},close(){},transaction(){
   const tx={objectStore:()=>({get(){const r={};queueMicrotask(()=>{r.result=structuredClone(stored);r.onsuccess()});return r},put(value){tx.candidate=value;return {}}}),abort(){queueMicrotask(()=>tx.onabort())}};transactions.push(tx);return tx;
 }};
 const indexedDB={open(){const r={};queueMicrotask(()=>{r.result=connection;r.onsuccess()});return r}};
 const {TrainingStorage:S}=load(['training-schema.js','training-storage.js']);const repo=await S.open({indexedDB});let done=false;
 const p=repo.transact({expectedRevision:0,operationId:'a'},s=>{s.db.people[0].name='Cambio';return s}).then(v=>{done=true;return v});
 await new Promise(r=>setImmediate(r));assert.equal(done,false);const tx=transactions.at(-1);assert.equal(tx.candidate.db.people[0].name,'Cambio');stored=tx.candidate;tx.oncomplete();assert.equal((await p).revision,1);
 const failed=repo.transact({expectedRevision:1,operationId:'b'},s=>{s.db.people[0].name='Perdido';return s});await new Promise(r=>setImmediate(r));transactions.at(-1).abort();await assert.rejects(failed);assert.equal(stored.db.people[0].name,'Cambio');
 const conflict=repo.transact({expectedRevision:0,operationId:'c'},s=>s);await assert.rejects(conflict,e=>e.code==='CONFLICT');
});
