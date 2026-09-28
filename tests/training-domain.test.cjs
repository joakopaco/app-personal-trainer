const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/load-training.cjs'),{fixture}=require('./helpers/training-fixture.cjs');
function setup(){const c=load(['training-schema.js','training-domain.js','training-months.js']);let i=0;return {...c,ctx:{id:()=>`id-${++i}`,now:()=>new Date(2026,8,28,10)}}}
const start={type:'start',operationId:'start',personId:'p1',sessionId:'s1',dayId:'d1',week:2,date:'2026-09-28',time:'10:00'};
test('live updates have before/after, propagate only selected weeks, and finalize once',()=>{
 const {TrainingDomain:D,TrainingSchema:S,ctx}=setup();let s=D.apply(fixture(),start,ctx);
 for(const value of [22,24])s=D.apply(s,{type:'edit',operationId:'edit'+value,sessionId:'s1',blockId:'b1',exerciseId:'e1',field:'weight',value},ctx);
 assert.equal(s.db.people[0].records.length,0);assert.equal(s.db.people[0].routine.weeks[0][0].blocks[0].exercises[0].weight,20);
 assert.equal(s.db.people[0].routine.weeks[3][0].blocks[0].exercises[0].weight,24);
 assert.equal(s.db.people[0].history.at(-1).before,22);assert.equal(s.db.people[0].history.at(-1).after,24);
 s=D.apply(s,{type:'finish',sessionId:'s1',operationId:'close'},ctx);s=D.apply(s,{type:'finish',sessionId:'s1',operationId:'close-again'},ctx);
 assert.equal(s.db.people[0].records.length,1);assert.equal(s.db.people[0].records[0].weight,24);assert.doesNotThrow(()=>S.validate(s));
 s=D.apply(s,{...start,sessionId:'s2',operationId:'start2'},ctx);s=D.apply(s,{type:'finish',sessionId:'s2',operationId:'close2'},ctx);assert.equal(s.db.people[0].records.length,2);
});
test('repeated exercise positions and other students remain independent',()=>{
 const {TrainingDomain:D,ctx}=setup();const f=fixture();const other=structuredClone(f.db.people[0]);other.id='p2';f.db.people.push(other);
 for(const w of f.db.people[0].routine.weeks){const b=structuredClone(w[0].blocks[0]);b.id='b2';w[0].blocks.push(b)}
 let s=D.apply(f,start,ctx);s=D.apply(s,{...start,sessionId:'duplicate'},ctx);assert.equal(s.db.sessions.length,1);
 s=D.apply(s,{type:'edit',operationId:'e',sessionId:'s1',blockId:'b1',exerciseId:'e1',field:'weight',value:25},ctx);
 assert.equal(s.db.sessions[0].blocks[1].exercises[0].weight,20);assert.equal(s.db.people[1].routine.weeks[1][0].blocks[0].exercises[0].weight,20);
 assert.throws(()=>D.apply(s,{type:'edit',sessionId:'s1',blockId:'wrong',exerciseId:'e1',field:'weight',value:26},ctx));
});
test('absence and reschedule do not change recurring schedules; started visit cannot be absent',()=>{
 const {TrainingDomain:D,ctx}=setup();const f=fixture();f.db.visits.push({id:'v1',personId:'p1',date:'2026-09-28',time:'10:00',status:'pending',source:'schedule',rescheduledFrom:null,rescheduledTo:null});
 const s=D.apply(f,{type:'absent',visitId:'v1',operationId:'absent'},ctx);assert.equal(s.db.visits[0].status,'absent');assert.equal(s.db.people[0].scheduleTimes.Lun,'10:00');
 const r=D.apply(f,{type:'reschedule',visitId:'v1',newVisitId:'v2',date:'2026-09-29',time:'11:00',operationId:'move'},ctx);assert.equal(r.db.visits[0].rescheduledTo,'v2');assert.equal(r.db.visits[1].rescheduledFrom,'v1');
 const live=D.apply(f,{...start,visitId:'v1'},ctx);assert.throws(()=>D.apply(live,{type:'absent',visitId:'v1'},ctx));
});
test('skips, rest and corrections preserve historical prescription',()=>{
 const {TrainingDomain:D,TrainingSchema:S,ctx}=setup();let s=D.apply(fixture(),start,ctx);
 s=D.apply(s,{type:'edit',sessionId:'s1',blockId:'b1',field:'macroRest',value:90,operationId:'rest'},ctx);
 s=D.apply(s,{type:'edit',sessionId:'s1',blockId:'b1',exerciseId:'e1',field:'microRest',value:0,operationId:'micro'},ctx);
 s=D.apply(s,{type:'finish',sessionId:'s1',operationId:'end'},ctx);assert.equal(s.db.people[0].records[0].macroRest,90);
 s=D.apply(s,{type:'correct',sessionId:'s1',blockId:'b1',exerciseId:'e1',field:'weight',value:30,operationId:'correct'},ctx);
 assert.equal(s.db.people[0].records[0].weight,30);assert.equal(s.db.people[0].routine.weeks[1][0].blocks[0].exercises[0].weight,20);assert.doesNotThrow(()=>S.validate(s));
 let skipped=D.apply(fixture(),start,ctx);skipped=D.apply(skipped,{type:'skip',sessionId:'s1',blockId:'b1',exerciseId:'e1',value:true,operationId:'skip'},ctx);skipped=D.apply(skipped,{type:'finish',sessionId:'s1',operationId:'end'},ctx);assert.equal(skipped.db.people[0].records.length,0);
});
test('renewal defers open sessions, preserves prior month and is idempotent',()=>{
 const {TrainingDomain:D,TrainingMonths:M,TrainingSchema:S,ctx}=setup();let s=D.apply(fixture(),start,ctx);ctx.now=()=>new Date(2026,9,1,1);
 s=M.renew(s,ctx.now(),ctx);assert.equal(s.db.people[0].routine.period,'2026-09');s=D.apply(s,{type:'finish',sessionId:'s1',operationId:'end'},ctx);
 s=M.renew(s,ctx.now(),ctx);s=M.renew(s,ctx.now(),ctx);assert.equal(s.db.people[0].archives.length,1);assert.equal(s.db.people[0].routine.period,'2026-10');assert.doesNotThrow(()=>S.validate(s));
 s=M.renew(s,new Date(2027,1,28),ctx);assert.equal(s.db.people[0].archives.length,2);assert.equal(s.db.people[0].routine.period,'2027-02');
 s=M.renew(s,new Date(2026,0,1),ctx);assert.equal(s.db.people[0].routine.period,'2027-02');
});
test('stale draft comparison identifies changes since its base',()=>{
 const {TrainingMonths:M}=setup(),p=fixture().db.people[0];p.draft=structuredClone(p.routine);p.draft.baseRoutine=structuredClone(p.routine);
 assert.equal(M.draftDifferences(p).length,0);p.routine.weeks[1][0].blocks[0].exercises[0].weight=25;
 assert.equal(M.draftDifferences(p)[0].current,25);assert.equal(M.draftDifferences(p)[0].draft,20);
});
