/* Modelo de demostración con guardado local en este navegador; sin backend. */
const copy = value => structuredClone(value);
const TODAY = '2026-09-23';
const WEEKDAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
let serial = 0;
const uid = () => `demo-${++serial}`;
const normalize = value => value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const libraryItems = [];
for (const day of DEMO.days) {
  for (const e of day.exercises) if (!libraryItems.some(x=>x.name===e[0])) libraryItems.push({id:uid(),name:e[0],group:e[1],sets:e[2],reps:Number(e[3].split('–').pop()),weight:e[4],notes:''});
  for (const name of day.warm) if (!libraryItems.some(x=>x.name===name)) libraryItems.push({id:uid(),name,group:'Movilidad',sets:3,reps:10,weight:0,notes:''});
}
function exerciseByName(name) { return libraryItems.find(e=>e.name===name)||libraryItems.find(e=>e.name.startsWith(name))||libraryItems[0]; }
function routineDay(seedIndex, weekday, offset=0) {
  const seed=DEMO.days[seedIndex];
  return {id:uid(),title:seed.title,weekday,
    mobility:seed.warm.map((name,i)=>({...copy(exerciseByName(name)),id:uid(),sets:3,reps:i===1?6:10,weight:0})),
    approximation:[{...copy(exerciseByName(seed.exercises[0][0])),id:uid(),sets:3,reps:6,weight:0}],
    main:seed.exercises.map(e=>({...copy(exerciseByName(e[0])),id:uid(),weight:Math.max(0,e[4]+offset)}))};
}
function buildRoutine(name, weekdays, seeds, offset=0, date='2026-09-14') {
  const days=weekdays.map((d,i)=>routineDay(seeds[i%seeds.length],d,offset));
  return {id:uid(),name,date,weeks:Array.from({length:4},()=>copy(days)),revision:1};
}
const DB = {
  library:libraryItems,
  people:DEMO.people.map((p,i)=>({id:uid(),...p,weekdays:p.days.split(' · '),routine:null,archives:[],records:[],attendance:p.status,attendanceDate:TODAY})),
  templates:[],
};
const configs=[[[0,1,2],0,'Fuerza e hipertrofia'],[[1,2,0],-4,'Base de fuerza'],[[2,0,1,2],6,'Torso y piernas'],[[0,1,2],-2,'Progresión de fuerza'],[[0,1],-6,'Cuerpo completo'],[[1,2,0],2,'Fuerza · Empuje y tracción']];
DB.people.forEach((p,i)=>{
  const [seeds,offset,name]=configs[i];
  p.routine=buildRoutine(name,p.weekdays,seeds,offset);
  if(i===4)p.routine.weeks.forEach(week=>week.forEach(day=>day.title='Cuerpo completo'));
  const previous=buildRoutine('Base y adaptación',p.weekdays,seeds,offset-2,'2026-08-17');
  const older=buildRoutine('Inicio de progresión',p.weekdays,seeds,offset-4,'2026-07-20');
  p.archives=[previous,older];
  p.sessionIndex=i===4?0:1;
  if(i===0)p.routine.weeks[0][0].main[1].weight=20;
});
DB.templates=[
  buildRoutine('Fuerza e hipertrofia · 3 días',['Lun','Mié','Vie'],[0,1,2]),
  buildRoutine('Torso y piernas · 4 días',['Lun','Mar','Jue','Vie'],[0,1,2,1]),
  buildRoutine('Inicio de fuerza · 2 días',['Mar','Jue'],[0,1],-8),
];
const metricExercises=[
  {name:'Remo con barra agarre prono',group:'Espalda',weights:[24,26,28,28,30,30,32,34,34,36,38,40],reps:8},
  {name:'Remo con mancuerna a un brazo',group:'Espalda',weights:[10,10,12,12,14,14,14,16,16,18,20,22],reps:8},
  {name:'Press plano con barra',group:'Pecho',weights:[20,22,24,24,26,28,30,32,34,36,38,40],reps:8},
  {name:'Press inclinado con mancuernas',group:'Pecho',weights:[8,8,10,10,10,12,12,12,14,14,14,16],reps:8},
  {name:'Sentadilla con barra',group:'Cuádriceps',weights:[25,28,30,30,32,35,35,40,40,42,45,50],reps:8},
  {name:'Sillón de cuádriceps',group:'Cuádriceps',weights:[15,15,18,18,20,20,22,22,25,25,28,30],reps:10},
  {name:'Peso muerto rumano con barra',group:'Isquios',weights:[20,20,22,24,26,28,28,30,32,35,38,40],reps:8},
  {name:'Press militar con mancuernas',group:'Hombros',weights:[6,6,6,8,8,8,8,10,10,10,12,12],reps:10},
  {name:'Bíceps con barra W',group:'Bíceps',weights:[8,8,8,10,10,10,10,12,12,12,14,15],reps:8},
  {name:'Press francés con barra W',group:'Tríceps',weights:[8,8,8,10,10,10,10,12,12,12,14,15],reps:8},
];
DB.people.forEach((p,pi)=>metricExercises.forEach(e=>e.weights.forEach((weight,mi)=>{
  const month=(mi+9)%12+1,year=mi<3?2025:2026;
  p.records.push({date:`${year}-${String(month).padStart(2,'0')}-21`,name:e.name,group:e.group,weight:Math.max(1,weight+configs[pi][1]),reps:e.reps,sets:3,source:'demo'});
})));
// Puntos semanales de ejemplo para que el último mes también muestre un recorrido.
DB.people.forEach((p,pi)=>metricExercises.forEach(e=>{
  [['2026-08-28',e.weights[10]],['2026-09-07',e.weights[10]],['2026-09-14',e.weights[11]]].forEach(([date,weight])=>p.records.push({date,name:e.name,group:e.group,weight:Math.max(1,weight+configs[pi][1]),reps:e.reps,sets:3,source:'demo'}));
}));
DB.branding={name:'Mateo Torres',subtitle:'PERSONAL TRAINER',accent:'#204f43',logo:'favicon.svg',footer:'Cada entrenamiento cuenta.',density:'comfortable'};
const STORAGE_KEY='pulso-demo-v5';
let storageAvailable=true;
try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');if(saved?.version===5&&Array.isArray(saved.db?.people)&&saved.db.people.length&&Array.isArray(saved.db.templates)&&Array.isArray(saved.db.library)){Object.assign(DB,saved.db);serial=Math.max(serial,saved.serial||0)}}catch{storageAvailable=false}
// Completa solo los perfiles ficticios conocidos; los alumnos previos eligen su género al editar.
DB.people.forEach(p=>{
  if(p.scheduleTime===undefined)p.scheduleTime=DEMO.people.find(seed=>seed.name===p.name)?.scheduleTime||'';
  if(!p.scheduleTimes)p.scheduleTimes=Object.fromEntries(p.weekdays.map(day=>[day,p.scheduleTime||'']));
  if(!['masculino','femenino'].includes(p.gender))p.gender=DEMO.people.find(seed=>seed.name===p.name)?.gender||'';
});
const genderLabel = p => ({masculino:'Masculino',femenino:'Femenino'}[p.gender]||'Sin especificar');
// La edición vive en memoria; solo Guardar borrador actualiza estas copias.
const savedDrafts=new Map(DB.people.filter(p=>p.draft).map(p=>[p.id,copy(p.draft)]));
const draftSaveErrors=new Set();
function draftHasChanges(p){return Boolean(p.draft)&&JSON.stringify(p.draft)!==JSON.stringify(savedDrafts.get(p.id))}
function persist(){
  const db=copy(DB);
  db.people.forEach(p=>{if(savedDrafts.has(p.id))p.draft=copy(savedDrafts.get(p.id));else delete p.draft});
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:5,db,serial}));storageAvailable=true;return true}catch{storageAvailable=false;return false}
}
function saveDraft(p){
  if(!p.draft)return false;
  if(!draftHasChanges(p)){draftSaveErrors.delete(p.id);return true}
  const previous=savedDrafts.get(p.id),working=copy(p.draft);
  const history=copy(p.history||[]);
  p.draft.savedAt=new Date().toISOString();savedDrafts.set(p.id,copy(p.draft));
  recordHistory(p,'changes','Borrador guardado',routineChanges(previous,p.draft),{draftId:p.draft.id});
  if(persist()){draftSaveErrors.delete(p.id);return true}
  p.draft=working;p.history=history;
  if(previous)savedDrafts.set(p.id,previous);else savedDrafts.delete(p.id);
  draftSaveErrors.add(p.id);return false;
}
function discardDraft(p){
  const working=p.draft,previous=savedDrafts.get(p.id),history=copy(p.history||[]);
  if(working)recordHistory(p,'changes','Borrador descartado',[working.name]);
  delete p.draft;savedDrafts.delete(p.id);
  if(persist()){draftSaveErrors.delete(p.id);return true}
  p.draft=working;p.history=history;if(previous)savedDrafts.set(p.id,previous);return false;
}
const state={page:'agenda',person:0,day:0,week:2,period:'six',group:'Espalda',metricName:'Remo con barra agarre prono',customStart:'2026-01-01',customEnd:'2026-03-31',document:'routine',archiveId:null,templateId:null,draftMode:false,bodyMode:'progress',bankPreview:null,empty:false};
const person=()=>DB.people[state.person];
const activeRoutine=()=>state.templateId?DB.templates.find(r=>r.id===state.templateId):state.archiveId?person().archives.find(r=>r.id===state.archiveId):state.draftMode?person().draft:person().routine;
const isRoutineReadOnly=()=>!state.draftMode&&!state.templateId;
const currentDay=()=>activeRoutine()?.weeks[state.week-1]?.[state.day];
function cloneRoutine(source,name=source.name) {
  const r=copy(source);r.id=uid();r.name=name;r.date=TODAY;r.revision=1;return r;
}
function emptyTemplate(name,count){
  const days=Array.from({length:count},(_,i)=>({id:uid(),title:`Día ${i+1}`,weekday:'Sin asignar',mobility:[],approximation:[],main:[]}));
  return {id:uid(),name,date:TODAY,weeks:Array.from({length:4},()=>copy(days)),revision:1};
}
function assignRoutine(source=null) {
  const p=person();
  const days=p.weekdays.map(d=>({id:uid(),title:'Por armar',weekday:d,mobility:[],approximation:[],main:[]}));
  p.draft=source?cloneRoutine(source):{id:uid(),name:'Rutina personalizada',date:TODAY,weeks:Array.from({length:4},()=>copy(days)),revision:1};
  p.draft.sourceName=source?.name||'Desde cero';delete p.draft.savedAt;draftSaveErrors.delete(p.id);
  p.draft.weeks.forEach(w=>w.forEach((d,i)=>d.weekday=p.weekdays[i]||'Sin asignar'));
  state.week=1;state.day=0;state.archiveId=null;state.templateId=null;state.draftMode=true;
}
function mutateDays(edit) {
  if(isRoutineReadOnly())return;
  const r=activeRoutine();
  for(let w=state.week-1;w<4;w++)if(r.weeks[w][state.day])edit(r.weeks[w][state.day]);
  r.revision++;
  if(state.templateId){r.savedAt=new Date().toISOString();persist()}
}
function rangeInfo(){
  if(state.period==='custom')return {start:state.customStart,end:state.customEnd,label:'Personalizado'};
  return {month:{start:'2026-08-24',end:TODAY,label:'Último mes'},six:{start:'2026-03-24',end:TODAY,label:'Últimos 6 meses'},year:{start:'2025-09-24',end:TODAY,label:'Último año'}}[state.period];
}
const dateLabel = d => new Date(d+'T12:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'short',year:'numeric'});
const rangeLabel = () => `${dateLabel(rangeInfo().start)} – ${dateLabel(rangeInfo().end)}`;
function progressData(){
  const range=rangeInfo();
  const records=state.empty?[]:person().records.filter(r=>r.date>=range.start&&r.date<=range.end&&(!r.zone||r.zone==='main'));
  const names=[...new Set(records.map(r=>r.name))];
  return names.map(name=>{
    const points=records.filter(r=>r.name===name).sort((a,b)=>a.date.localeCompare(b.date));
    const first=points[0],last=points.at(-1),best=Math.max(...points.map(p=>p.weight));
    return {name,group:first.group,points,first:first.weight,last:last.weight,best,delta:last.weight-first.weight,percent:first.weight>0?Math.round((last.weight-first.weight)/first.weight*100):null};
  });
}
