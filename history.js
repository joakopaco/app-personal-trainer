/* Historial por alumno. Las correcciones conservan los valores anteriores. */
DB.people.forEach(p=>{if(!Array.isArray(p.history))p.history=[]});
const valueLabel=value=>value===null||value===undefined||value===''?'Sin definir':String(value);
const completeExercise=e=>Number.isInteger(e.weight)&&e.weight>=0&&e.weight<=150&&Number.isInteger(e.sets)&&e.sets>=1&&e.sets<=4&&Number.isInteger(e.reps)&&e.reps>=1&&e.reps<=15;
function recordHistory(p,type,title,details=[],extra={}){
  const entry={id:uid(),date:TODAY,recordedAt:new Date().toISOString(),type,title,details:copy(details),...extra};
  (p.history||(p.history=[])).push(entry);return entry;
}
function routineChanges(before,after){
  const changes=[];
  if(!before)changes.push(`Borrador creado desde ${after.sourceName||'cero'}.`);
  if(before&&before.name!==after.name)changes.push(`Nombre: ${before.name} → ${after.name}`);
  for(let wi=0;wi<after.weeks.length;wi++){
    const previous=before?.weeks[wi]||[];
    for(const old of previous)if(!after.weeks[wi].some(d=>d.id===old.id))changes.push(`Semana ${wi+1}: día ${old.title} eliminado.`);
    for(const d of after.weeks[wi]){
      const old=previous.find(v=>v.id===d.id),prefix=`Semana ${wi+1} · ${d.title}`;
      if(!old)changes.push(`${prefix}: día agregado.`);
      for(const b of old?.blocks||[])if(!d.blocks.some(v=>v.id===b.id))changes.push(`${prefix}: bloque ${b.name} eliminado.`);
      for(const [bi,b] of d.blocks.entries()){
        const ob=old?.blocks.find(v=>v.id===b.id);
        if(!ob)changes.push(`${prefix}: bloque ${b.name} agregado.`);
        else if(ob.name!==b.name||old.blocks.indexOf(ob)!==bi)changes.push(`${prefix}: bloque ${b.name}, posición ${bi+1}.`);
        for(const key of ['macroRest','macroTarget'])if(ob?.[key]!==b[key])changes.push(`${prefix} · ${b.name}: ${key==='macroRest'?'Descanso macro':'Aplicación'} ${valueLabel(ob?.[key])} → ${valueLabel(b[key])}.`);
        for(const e of ob?.exercises||[])if(!b.exercises.some(v=>v.id===e.id))changes.push(`${prefix} · ${b.name}: ${e.name} eliminado.`);
        for(const e of b.exercises){
          const oe=ob?.exercises.find(v=>v.id===e.id);if(!oe)changes.push(`${prefix} · ${b.name}: ${e.name} agregado.`);
          const fields=[['weight','peso',' kg'],['sets','series',''],['reps','repeticiones',''],['microRest','descanso micro',' s']].filter(([k])=>oe?.[k]!==e[k]);
          if(fields.length)changes.push(`${prefix} · ${e.name}: ${fields.map(([k,l,u])=>`${l}: ${valueLabel(oe?.[k])}${u} → ${valueLabel(e[k])}${u}`).join(' · ')}.`);
        }
      }
    }
  }return changes;
}
async function saveSession(p,records){
  if(!records.length||records.some(r=>!completeExercise(r)))return false;
  const previous=copy(p.records),attendance=p.attendance,history=copy(p.history||[]),corrections=[];
  records.forEach(record=>{
    const index=p.records.findIndex(r=>r.date===record.date&&r.exerciseId===record.exerciseId&&r.routineId===record.routineId);
    if(index>=0){const old=p.records[index];if(['weight','sets','reps'].some(key=>old[key]!==record[key]))corrections.push({before:copy(old),after:copy(record)});p.records[index]=record}
    else p.records.push(record);
  });
  if(corrections.length)recordHistory(p,'changes','Registro de entrenamiento corregido',corrections.map(({before:a,after:b})=>`${b.name}: peso ${a.weight} → ${b.weight} kg · series ${a.sets} → ${b.sets} · reps ${a.reps} → ${b.reps}.`),{corrections});
  p.attendance='Confirmado';
  if(await persist())return true;
  p.records=previous;p.attendance=attendance;p.history=history;return false;
}
function historyEntries(p){
  const events=(p.history||[]).map(e=>({...e,kind:e.type}));
  const routines=[...p.archives,...(p.routine?[p.routine]:[])];
  routines.filter(r=>!events.some(e=>e.routineId===r.id&&e.type==='routine')).forEach(r=>events.push({id:`routine-${r.id}`,date:r.activatedAt||r.date,kind:'routine',title:r===p.routine?'Rutina actual':'Rutina anterior',routine:r,details:[r.name,`${r.weeks[0].length} días · 4 semanas`]}));
  const sessions=new Map();
  p.records.forEach(r=>{const key=r.sessionId||`${r.date}|${r.routineId||'legacy'}|${r.source||'legacy'}`;if(!sessions.has(key))sessions.set(key,[]);sessions.get(key).push(r)});
  for(const [key,records] of sessions){
    const routine=routines.find(r=>r.id===records[0].routineId);
    events.push({id:key,date:records[0].date,kind:'sessions',title:records[0].source==='demo'?'Registros de entrenamiento · Muestra':'Entrenamiento registrado',records,routineName:routine?.name||'Registros anteriores'});
  }
  return events.sort((a,b)=>b.date.localeCompare(a.date)||(b.recordedAt||'').localeCompare(a.recordedAt||''));
}
function sessionTable(records,p){
  return `<div class="table-wrap"><table class="data-table history-table"><thead><tr><th>Ejercicio</th><th>Peso</th><th>Series</th><th>Reps</th><th>Descansos</th><th>Vs. anterior</th><th></th></tr></thead><tbody>${records.map(r=>{
    const previous=p.records.filter(v=>v.name===r.name&&(v.date<r.date||(v.date===r.date&&(v.startedAt||'')<(r.startedAt||'')))&&(!v.zone||v.zone==='main')&&(!r.zone||r.zone==='main')).sort((a,b)=>b.date.localeCompare(a.date)||(b.startedAt||'').localeCompare(a.startedAt||''))[0];
    const delta=previous?r.weight-previous.weight:null;
    return `<tr><td>${escapeHTML(r.name)}<small>${escapeHTML(zoneLabel[r.zone]||r.group)}</small></td><td>${valueLabel(r.weight)} kg</td><td>${valueLabel(r.sets)}</td><td>${valueLabel(r.reps)}</td><td>Micro: ${valueLabel(r.microRest)} s<br>Macro: ${valueLabel(r.macroRest)} s</td><td>${delta===null?'—':`${delta>0?'+':''}${delta} kg`}<small>${previous?dateLabel(previous.date):'Sin registro previo'}</small></td><td>${r.sessionId?btn('Corregir',`train-correct:${r.sessionId}:${r.blockId}:${r.exerciseId}`,'text compact'):''}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
let historyFilter='all',historyLimit=15;
function historyScreen(){
  const p=person(),entries=historyEntries(p).filter(e=>historyFilter==='all'||e.kind===historyFilter);
  return `${studentHeader()}<div class="page-head"><div><h1>Historial del alumno</h1><p>${escapeHTML(p.name)} · Rutinas, entrenamientos y cambios registrados</p></div></div>${profileTabs('history')}<div class="history-filters segmented">${[['all','Todo'],['routine','Rutinas'],['sessions','Entrenamientos y pesos'],['changes','Cambios'],['profile','Datos y visitas']].map(([key,label])=>`<button class="segment ${historyFilter===key?'active':''}" data-history-filter="${key}" aria-pressed="${historyFilter===key}">${label}</button>`).join('')}</div><p class="fineprint">Los cambios detallados se registran desde esta actualización. Los registros anteriores disponibles también se muestran. Los ajustes en vivo conservan el valor anterior y actualizan la rutina. Progreso usa solo entrenamientos finalizados.</p><div class="history-feed">${entries.slice(0,historyLimit).map(e=>{
    const routine=e.routine||[p.routine,...p.archives].find(r=>r?.id===e.routineId);
    return `<details class="card history-event"><summary><span class="history-event-icon">${icon(e.kind==='sessions'?'dumbbell':e.kind==='routine'?'routine':'history')}</span><span><small>${dateLabel(e.date)}${e.recordedAt?` · ${new Date(e.recordedAt).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}`:''}</small><strong>${escapeHTML(e.title)}</strong><span>${e.records?`${e.records.length} ejercicios · ${escapeHTML(e.routineName)}`:escapeHTML(e.details?.[0]||'Ver detalle')}</span></span>${icon('down')}</summary><div class="history-event-body">${e.records?sessionTable(e.records,p):`<ul>${(e.details||[]).map(detail=>`<li>${escapeHTML(detail)}</li>`).join('')}</ul>`}${routine?btn('Ver rutina',routine===p.routine?'open-current':`archive:${routine.id}`,'compact','routine'):''}</div></details>`;
  }).join('')||'<div class="card card-pad"><p>No hay registros en esta sección.</p></div>'}</div>${entries.length>historyLimit?btn('Mostrar más','history-more','spaced'):''}`;
}
function exerciseBankRows(query='',group='all'){
  const matches=DB.library.filter(e=>normalize(e.name).includes(normalize(query))&&(group==='all'||e.group===group));
  const groups=[...new Set(matches.map(e=>e.group))].sort((a,b)=>a.localeCompare(b,'es'));
  return groups.map(name=>{
    const exercises=matches.filter(e=>e.group===name).sort((a,b)=>a.name.localeCompare(b.name,'es'));
    return `<section class="card exercise-group-card" aria-label="${escapeHTML(name)}"><header class="exercise-group-heading"><span class="exercise-group-icon">${icon(name==='Movilidad'?'fire':'dumbbell')}</span><h2>${escapeHTML(name)}</h2><span class="tag">${exercises.length} ${exercises.length===1?'ejercicio':'ejercicios'}</span></header><ul class="exercise-group-list">${exercises.map(e=>`<li><strong>${escapeHTML(e.name)}</strong>${e.notes?`<p>${escapeHTML(e.notes)}</p>`:''}</li>`).join('')}</ul></section>`;
  }).join('')||'<div class="card card-pad exercise-bank-empty"><p>No hay ejercicios que coincidan. Probá otro nombre o grupo muscular.</p></div>';
}
function exerciseBank(){return `<div class="page-head"><div><h1>Banco de ejercicios</h1><p>Encontrá tus ejercicios organizados por grupo muscular.</p></div>${btn('Agregar ejercicio','new-exercise','primary','plus')}</div><section class="card"><div class="card-head exercise-bank-filters">${search('exercise-bank-search','Buscar ejercicio por nombre')}<label class="field"><span>Grupo muscular</span><select id="exercise-bank-group"><option value="all">Todos los grupos</option>${groupNames().sort((a,b)=>a.localeCompare(b,'es')).map(g=>`<option>${escapeHTML(g)}</option>`).join('')}</select></label><span class="tag">${DB.library.length} ejercicios en total</span></div></section><div class="exercise-bank-groups" id="exercise-bank-rows">${exerciseBankRows()}</div>`}
function refreshExerciseBank(){const rows=$('#exercise-bank-rows');if(rows)rows.innerHTML=exerciseBankRows($('#exercise-bank-search').value,$('#exercise-bank-group').value)}
views.history=historyScreen;views.exercises=exerciseBank;
document.addEventListener('click',event=>{const button=event.target.closest('[data-history-filter]');if(button){historyFilter=button.dataset.historyFilter;historyLimit=15;render()}});
document.addEventListener('input',event=>{if(event.target.id==='exercise-bank-search')refreshExerciseBank()});
document.addEventListener('change',event=>{if(event.target.id==='exercise-bank-group')refreshExerciseBank()});
