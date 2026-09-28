document.querySelector('#run').onclick=async()=>{
 const output=document.querySelector('#results');output.textContent='';const log=t=>output.textContent+=t+'\n';
 const assert=(v,label)=>{if(!v)throw Error(label);log('✓ '+label)};
 const name='pulso-check-'+crypto.randomUUID(),context={id:()=>crypto.randomUUID(),now:()=>new Date(2026,8,28,10)};let a,b;
 try{
  const block={id:'b1',name:'Principal',type:'main',macroRest:null,macroTarget:'series',exercises:[{id:'e1',name:'Remo',group:'Espalda',weight:20,sets:3,reps:8,microRest:null}]};
  const seed={version:6,revision:0,operationIds:[],db:{people:Array.from({length:5},(_,i)=>({id:'p'+i,name:'Alumno '+i,weekdays:['Lun'],scheduleTimes:{Lun:'10:00'},routine:{id:'r'+i,name:'Rutina',date:'2026-09-01',period:'2026-09',revision:1,weeks:Array.from({length:4},()=>[{id:'d1',title:'Fuerza',weekday:'Lun',blocks:[structuredClone(block)]}])},archives:[],records:[],history:[]})),templates:[],library:[],branding:{},visits:[],sessions:[]}};
  a=await TrainingStorage.open({name});await a.initialize(seed);b=await TrainingStorage.open({name});let state=await a.load();
  const command=async c=>{const operationId=context.id();state=await a.transact({expectedRevision:state.revision,operationId},s=>TrainingDomain.apply(s,{...c,operationId},context))};
  for(let i=0;i<5;i++)await command({type:'start',personId:'p'+i,sessionId:'s'+i,dayId:'d1',week:2,date:'2026-09-28',time:'10:00'});
  for(let i=0;i<5;i++)for(const value of [22+i,24+i])await command({type:'edit',sessionId:'s'+i,blockId:'b1',exerciseId:'e1',field:'weight',value});
  const reloaded=await b.load();assert(reloaded.db.sessions.length===5&&reloaded.db.sessions.every((s,i)=>s.blocks[0].exercises[0].weight===24+i),'Cinco sesiones y sus cargas se recuperan desde otra conexión');
  assert(reloaded.db.people.every((p,i)=>p.history.filter(e=>e.field==='weight').length===2&&p.routine.weeks[1][0].blocks[0].exercises[0].weight===24+i),'Rutina e historial before/after se guardan juntos');
  let failed=false;try{await a.transact({expectedRevision:state.revision,operationId:'abort'},s=>{s.db.people[0].name='NO GUARDAR';throw Error('Aborto simulado')})}catch{failed=true}
  assert(failed&&(await b.load()).db.people[0].name==='Alumno 0','Una transacción abortada conserva la versión anterior');
  let conflict=false;try{await b.transact({expectedRevision:0,operationId:'stale'},s=>s)}catch(e){conflict=e.code==='CONFLICT'}assert(conflict,'Dos conexiones detectan revisión desactualizada sin sobrescribir');
  const controller=TrainingController.create({repo:a,snapshot:state,context});controller.stage({sessionId:'s0',blockId:'b1',exerciseId:'e1',field:'weight',raw:'30'});await controller.flush();state=controller.snapshot();
  assert((await b.load()).db.sessions[0].blocks[0].exercises[0].weight===30,'Autosave confirma la escritura real antes de continuar');
  for(let i=0;i<5;i++)await command({type:'finish',sessionId:'s'+i});await command({type:'finish',sessionId:'s0'});
  assert((await b.load()).db.people.every(p=>p.records.length===1),'Doble cierre produce un solo resultado por sesión');
  await command({type:'start',personId:'p0',sessionId:'s-extra',dayId:'d1',week:2,date:'2026-09-28',time:'12:00'});await command({type:'finish',sessionId:'s-extra'});
  assert(state.db.people[0].records.length===2,'Dos sesiones del mismo día conservan resultados separados');
  const backup=TrainingBackup.parse(TrainingBackup.exportText(state));state=await TrainingBackup.restore(a,backup,{expectedRevision:state.revision,operationId:'restore',hasPending:false});
  assert((await b.load()).db.people[0].records.length===2,'Restauración validada recupera los resultados');
  state=await a.transact({expectedRevision:state.revision,operationId:'renew'},s=>TrainingMonths.renew(s,new Date(2026,9,1),context));
  assert((await b.load()).db.people.every(p=>p.routine.period==='2026-10'&&p.archives.length===1),'Renovación mensual conserva el mes anterior');
  let corrupt=false;try{TrainingBackup.parse('{broken')}catch{corrupt=true}assert(corrupt,'Una copia corrupta se rechaza antes de escribir');
  log('COMPLETADO: 10 comprobaciones correctas.');controller.dispose();
 }catch(e){log('FALLO: '+e.stack)}finally{a?.close();b?.close();indexedDB.deleteDatabase(name)}
};
