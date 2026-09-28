const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/load-training.cjs'),{fixture}=require('./helpers/training-fixture.cjs');
const schema=()=>load(['training-schema.js']).TrainingSchema;
test('numeric inputs preserve zero, null and transient invalid values',()=>{
  const s=schema();assert.equal(s.parseField('weight','').ok,false);assert.equal(s.parseField('weight','0').value,0);
  assert.equal(s.parseField('microRest','').value,null);for(const raw of ['-1','1e2','NaN','151','2.5'])assert.equal(s.parseField('weight',raw).ok,false);
  assert.equal(s.parseField('sets','5').ok,false);assert.equal(s.parseField('macroRest','3600').ok,true);assert.equal(s.defaultWeek(new Date(2026,8,30)),4);
});
test('legacy migration preserves independent snapshots and all exercise values',()=>{
  const s=schema(),db=fixture().db,p=db.people[0];
  for(const w of p.routine.weeks)for(const d of w){d.main=d.blocks[0].exercises;d.mobility=[];d.approximation=[];delete d.blocks}
  p.draft=structuredClone(p.routine);p.archives=[structuredClone(p.routine)];p.archives[0].id='old';p.draft.id='draft';
  p.attendanceDate='2026-09-28';p.attendance='Pendiente';const before=JSON.stringify(db);
  const result=s.migrateV5({version:5,db,serial:99});assert.equal(JSON.stringify(db),before);
  assert.equal(result.db.people[0].routine.weeks[0][0].blocks[2].exercises[0].weight,20);
  assert.equal(result.db.people[0].draft.weeks[0][0].blocks.length,3);assert.equal(result.db.visits.length,1);
  assert.equal(JSON.stringify(s.migrateV5(result)),JSON.stringify(result));assert.equal(result.serial,99);
});
test('validation rejects future schemas, duplicate persons and broken session references',()=>{
  const s=schema();assert.doesNotThrow(()=>s.validate(fixture()));let e=fixture();e.version=7;assert.throws(()=>s.validate(e));
  e=fixture();e.db.people.push(structuredClone(e.db.people[0]));assert.throws(()=>s.validate(e));
  e=fixture();e.db.sessions.push({id:'s',personId:'missing'});assert.throws(()=>s.validate(e));
});
