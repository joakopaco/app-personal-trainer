/* Integration boundary between the existing screens and confirmed v6 state. */
const trainingContext={id:uid,now:()=>new Date()};
let trainingActionBusy=false,trainingHydratedRevision=-1,trainingVisitContext=null,trainingBackupCandidate=null;
const trainingViewPositions=new Map();
const trainingConfirmedTemplates=new Map();
let trainingFeedbackBuffer=null;
const trainingImmediateToast=toast;
toast=message=>{if(trainingFeedbackBuffer)trainingFeedbackBuffer.push(message);else trainingImmediateToast(message)};
function templateHasChanges(){return DB.templates.some(r=>JSON.stringify(r)!==JSON.stringify(trainingConfirmedTemplates.get(r.id)))}
function hydrateTraining(snapshot,preserveWorking=true){
  const working=new Map(preserveWorking?DB.people.filter(draftHasChanges).map(p=>[p.id,copy(p.draft)]):[]);
  const templates=new Map(preserveWorking?DB.templates.filter(r=>trainingConfirmedTemplates.has(r.id)&&JSON.stringify(r)!==JSON.stringify(trainingConfirmedTemplates.get(r.id))).map(r=>[r.id,copy(r)]):[]);
  const selectedId=person()?.id;Object.assign(DB,copy(snapshot.db));serial=Math.max(serial,snapshot.serial||0);
  trainingConfirmedTemplates.clear();for(const r of DB.templates)trainingConfirmedTemplates.set(r.id,copy(r));
  DB.templates=DB.templates.map(r=>templates.get(r.id)||r);
  savedDrafts.clear();for(const p of DB.people){if(p.draft)savedDrafts.set(p.id,copy(p.draft));if(working.has(p.id))p.draft=working.get(p.id)}
  const index=DB.people.findIndex(p=>p.id===selectedId);state.person=index>=0?index:0;
  if(state.templateId&&!DB.templates.some(r=>r.id===state.templateId))state.templateId=null;
  if(state.archiveId&&!person()?.archives.some(r=>r.id===state.archiveId))state.archiveId=null;
  if(state.draftMode&&!person()?.draft)state.draftMode=false;
  trainingHydratedRevision=snapshot.revision;
}
function restoreTrainingContext(){
  try{
    const v=JSON.parse(sessionStorage.getItem('pulso-view-v5')||'null');if(!v)return;
    const index=DB.people.findIndex(p=>p.id===v.personId);if(index<0)return;
    state.person=index;state.archiveId=person().archives.some(r=>r.id===v.archiveId)?v.archiveId:null;
    state.templateId=DB.templates.some(r=>r.id===v.templateId)?v.templateId:null;
    state.draftMode=Boolean(v.draftMode&&person().draft);
    state.week=Number.isInteger(v.week)?Math.min(4,Math.max(1,v.week)):1;
    const days=activeRoutine()?.weeks[state.week-1]||[];
    state.day=Number.isInteger(v.day)?Math.min(Math.max(0,days.length-1),Math.max(0,v.day)):0;
    state.document=v.document==='progress'?'progress':'routine';
  }catch{}
}
function updateTrainingStatus(){
  if(!trainingController)return;const status=trainingController.status();storageAvailable=!['error','conflict'].includes(status.state);
  if(['error','conflict'].includes(status.state)&&!$('#training-recovery'))$('#main')?.insertAdjacentHTML('afterbegin','<aside id="training-recovery" class="training-notice" role="alert"><span data-training-status></span><div class="actions"><button type="button" class="btn" data-save-retry data-action="train-retry">Reintentar guardado</button><button type="button" class="btn" data-save-conflict data-action="train-conflict">Revisar otra versión</button></div></aside>');
  if($('#training-recovery'))$('#training-recovery').hidden=!['error','conflict'].includes(status.state);
  document.querySelectorAll('[data-training-status]').forEach(el=>el.textContent=status.message);
  document.querySelectorAll('.training-savebar,.training-global-status').forEach(el=>el.dataset.state=status.state);
  document.querySelectorAll('[data-save-retry]').forEach(el=>el.hidden=!(status.state==='error'||(trainingController.pending().length&&!trainingController.busy()&&status.state!=='conflict')));
  document.querySelectorAll('[data-save-conflict]').forEach(el=>el.hidden=status.state!=='conflict');
  for(const el of document.querySelectorAll('[data-pending-session]'))el.textContent=trainingController.pending().some(p=>p.sessionId===el.dataset.pendingSession)?'Cambios pendientes':'En curso';
  for(const el of document.querySelectorAll('[data-live-session]')){
    const entry=trainingController.pending().find(p=>p.sessionId===el.dataset.liveSession&&p.blockId===el.dataset.blockId&&(p.exerciseId||'')===(el.dataset.exerciseId||'')&&p.field===el.dataset.field);
    if(entry){if(document.activeElement!==el)el.value=entry.raw;el.setAttribute('aria-invalid',String(!entry.valid));const errorEl=el.parentElement.querySelector('.field-error');if(errorEl)errorEl.textContent=entry.valid?'':'Revisá el valor';}
    else el.removeAttribute('aria-invalid');
  }
}
async function renewTrainingMonth(){
  TODAY=TrainingSchema.dateKey(new Date());const snapshot=trainingController.snapshot(),renewed=TrainingMonths.renew(snapshot,new Date(),trainingContext);
  if(JSON.stringify(renewed.db)!==JSON.stringify(snapshot.db))await trainingController.commit(uid(),current=>TrainingMonths.renew(current,new Date(),trainingContext));
}
async function bootTraining(){
  $('#main').innerHTML='<section class="card training-loading"><h1>Abriendo tu espacio…</h1><p>Recuperando rutinas y entrenamientos guardados.</p></section>';
  try{
    trainingRepo=await TrainingStorage.open();let snapshot=await trainingRepo.load();
    if(!snapshot){
      const legacy=localStorage.getItem(STORAGE_KEY);
      const input=legacy===null?{version:5,serial,db:copy(DB)}:JSON.parse(legacy);
      snapshot=await trainingRepo.initialize(TrainingSchema.migrateV5(input));
    }
    hydrateTraining(snapshot,false);
    trainingController=TrainingController.create({repo:trainingRepo,snapshot,context:trainingContext,onState:update=>{if(update.snapshot.revision!==trainingHydratedRevision)hydrateTraining(update.snapshot);updateTrainingStatus()}});
    await renewTrainingMonth();restoreTrainingContext();
    try{const v=JSON.parse(sessionStorage.getItem('pulso-training-view')||'null');if(v&&DB.sessions.some(s=>s.id===v.sessionId))state.sessionId=v.sessionId}catch{}
    trainingReady=true;route();
    if(!$('.training-global-status'))$('.topbar-right').insertAdjacentHTML('afterbegin','<span class="training-global-status" data-training-status role="status"></span>');
    updateTrainingStatus();
  }catch(e){
    trainingReady=false;$('#main').innerHTML=`<section class="card training-loading"><h1>No pudimos abrir tus datos</h1><p>${escapeHTML(e.message)}</p><p>Los datos anteriores se conservan. No se reemplazaron por una demo nueva.</p><button class="btn primary" id="retry-training-boot">Reintentar</button></section>`;
    $('#retry-training-boot').onclick=()=>{trainingRepo?.close();bootTraining()};
  }
}
function reportTrainingError(e){
  updateTrainingStatus();
  if($('#modal')?.open&&$('#form-error')){
    error(e.message);const status=trainingController.status();
    if(['error','conflict'].includes(status.state))$('#form-error').insertAdjacentHTML('beforeend',status.state==='conflict'?'<button type="button" class="btn" data-action="train-conflict">Revisar otra versión</button>':'<button type="button" class="btn" data-action="train-retry">Reintentar guardado</button>');
  }else toast(e.message);
}
async function dispatchAction(command){
  if(!trainingReady)return;
  const kind=command.split(':')[0];
  if(trainingActionBusy)return;
  trainingActionBusy=true;
  try{
    if(await trainingAction(command))return;
    if(await trainingEditorAction(command))return;
    const externalMutations=new Set(['save-new-exercise','save-student','save-empty-template','confirm-rename-template']);
    const mustPersist=externalMutations.has(kind);
    if(mustPersist)await trainingController.flush();
    const before=mustPersist?trainingController.snapshot():null;
    if(mustPersist)trainingFeedbackBuffer=[];
    if(!await lifecycleAction(command))await runAction(command);
    const scope=kind==='save-new-exercise'?{library:true}:kind==='save-student'?{personId:person().id,fields:['name','initials','gender','scheduleTimes','scheduleTime','weekdays','count','days','history']}:kind==='save-empty-template'||kind==='confirm-rename-template'?{templateIds:[state.templateId]}:{};
    if(mustPersist&&!await persist(scope)){
      trainingFeedbackBuffer=null;
      hydrateTraining(before);render();throw new Error('No se pudo guardar. La última versión confirmada sigue intacta. Reintentá desde el aviso de guardado.');
    }
    const messages=trainingFeedbackBuffer;trainingFeedbackBuffer=null;if(messages)for(const message of messages)toast(message);
    updateTrainingStatus();
  }catch(e){trainingFeedbackBuffer=null;reportTrainingError(e)}finally{trainingActionBusy=false;updateTrainingStatus()}
}
async function commitTraining(command,visit=null){
  await trainingController.flush();const op={...command,operationId:uid()};
  await trainingController.commit(op.operationId,s=>{
    if(visit&&!s.db.visits.some(v=>v.id===visit.id))s.db.visits.push(copy(visit));
    return TrainingDomain.apply(s,op,trainingContext);
  },'domain');
  updateTrainingStatus();
}
function showTrainingStart(personId,visit=null){
  const p=DB.people.find(p=>p.id===personId),open=DB.sessions.find(s=>s.personId===personId&&s.status==='open');
  if(open){openTraining(open.id);return}
  if(!p?.routine){toast('Primero creá y activá la rutina del alumno.');return}
  trainingVisitContext=visit;const now=new Date(),time=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  modalContext={trainingPerson:personId};
  modal('Iniciar entrenamiento',p.name,`<label class="field"><span>Día de rutina</span><select id="training-day">${p.routine.weeks[0].map(d=>`<option value="${d.id}">${escapeHTML(d.title)} · ${escapeHTML(d.weekday)}</option>`).join('')}</select></label><label class="field"><span>Semana</span><select id="training-week">${[1,2,3,4].map(w=>`<option value="${w}" ${w===TrainingSchema.defaultWeek(now)?'selected':''}>Semana ${w}</option>`).join('')}</select></label><label class="field"><span>Hora</span><input id="training-time" type="time" value="${visit?.time||time}" required></label><p class="fineprint">${dateLabel(TODAY)} · La sesión queda abierta hasta que la finalices.</p>`,'Iniciar','train-start-confirm');
}
function openTraining(id){
  if(state.sessionId)trainingViewPositions.set(state.sessionId,window.scrollY);
  state.sessionId=id;const s=DB.sessions.find(s=>s.id===id);if(s)state.person=DB.people.findIndex(p=>p.id===s.personId);
  try{sessionStorage.setItem('pulso-training-view',JSON.stringify({sessionId:id}))}catch{}
  closeModal();go('training');
  requestAnimationFrame(()=>{updateTrainingStatus();window.scrollTo(0,trainingViewPositions.get(id)||0)});
}
async function trainingAction(command){
  const [kind,id,bid,eid]=command.split(':');
  if(kind==='train-open'){trainingController.flush().catch(reportTrainingError);openTraining(id);return true}
  if(kind==='train-start'){showTrainingStart(id);return true}
  if(kind==='train-quick'){
    modal('Agregar entrenamiento ahora','Elegí a quien acaba de llegar.',`<label class="field"><span>Buscar alumno</span><input id="training-person-search" type="search" placeholder="Nombre o apellido"></label><label class="field"><span>Alumno</span><select id="training-person">${DB.people.map(p=>`<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('')}</select></label>`,'Continuar','train-quick-select');return true;
  }
  if(kind==='train-quick-select'){showTrainingStart($('#training-person').value);return true}
  if(kind==='train-visit'){const row=calendarVisits(TODAY).find(x=>x.visit.id===id);if(row)showTrainingStart(row.person.id,row.visit);return true}
  if(kind==='train-start-confirm'){
    await trainingController.flush();await renewTrainingMonth();
    const sessionId=uid();await commitTraining({type:'start',personId:modalContext.trainingPerson,visitId:trainingVisitContext?.id,sessionId,dayId:$('#training-day').value,week:Number($('#training-week').value),date:TODAY,time:$('#training-time').value},trainingVisitContext);
    const actual=DB.sessions.find(s=>s.personId===modalContext.trainingPerson&&s.status==='open');openTraining(actual.id);return true;
  }
  if(kind==='train-absent'){
    const row=calendarVisits(TODAY).find(x=>x.visit.id===id);if(!row)return true;trainingVisitContext=row.visit;
    modal('Registrar falta',row.person.name,'<p>No se creará otra visita. La falta quedará en el historial.</p>','No asistió',`train-absent-confirm:${id}`);return true;
  }
  if(kind==='train-absent-confirm'){await commitTraining({type:'absent',visitId:id},trainingVisitContext);closeModal();render();return true}
  if(kind==='train-reschedule'){
    const row=calendarVisits(TODAY).find(x=>x.visit.id===id);if(!row)return true;trainingVisitContext=row.visit;
    modal('Reprogramar visita',row.person.name,`<label class="field"><span>Fecha</span><input id="training-visit-date" type="date" min="${TODAY}" value="${TODAY}" required></label><label class="field"><span>Hora</span><input id="training-visit-time" type="time" value="${row.time}" required></label>`,'Reprogramar',`train-reschedule-confirm:${id}`);return true;
  }
  if(kind==='train-reschedule-confirm'){await commitTraining({type:'reschedule',visitId:id,newVisitId:uid(),date:$('#training-visit-date').value,time:$('#training-visit-time').value},trainingVisitContext);closeModal();render();return true}
  if(kind==='train-finish'){
    await trainingController.flush(id);const s=DB.sessions.find(x=>x.id===id),rows=s.blocks.flatMap(b=>b.exercises),omitted=rows.filter(e=>e.skipped);
    modal('Finalizar entrenamiento',DB.people.find(p=>p.id===s.personId).name,`<p>Se registrarán <strong>${rows.length-omitted.length} ejercicios</strong> con los valores guardados.</p><p>${omitted.length} ejercicios marcados como no realizados.</p><p>Los ajustes anteriores quedan en el historial.</p>`,'Finalizar y guardar',`train-finish-confirm:${id}`);return true;
  }
  if(kind==='train-finish-confirm'){TODAY=TrainingSchema.dateKey(new Date());await commitTraining({type:'finish',sessionId:id});await renewTrainingMonth();closeModal();render();toast('Entrenamiento finalizado y guardado.');return true}
  if(kind==='train-retry'){await trainingController.retry();await renewTrainingMonth();closeModal();render();return true}
  if(kind==='train-conflict'){
    modal('Hay una versión más nueva','Otra pestaña guardó datos antes que esta.',`<p>Primero cargá la versión nueva. Tus ${trainingController.pending().length} campos pendientes seguirán disponibles para revisar y volver a guardar.</p><p>Los cambios de formularios fuera del entrenamiento deben ingresarse de nuevo sobre esa versión.</p>`,'Cargar versión nueva','train-conflict-load');return true;
  }
  if(kind==='train-conflict-load'){
    await trainingController.reloadConflict();render();
    const snapshot=trainingController.snapshot(),pending=trainingController.pending();
    if(!pending.length){closeModal();toast('Versión nueva cargada. Podés volver a ingresar el cambio del formulario.');return true}
    let canApply=true;
    const rows=pending.map(input=>{
      const s=snapshot.db.sessions.find(s=>s.id===input.sessionId),b=s?.blocks.find(b=>b.id===input.blockId),target=input.exerciseId?b?.exercises.find(e=>e.id===input.exerciseId):b;
      const p=snapshot.db.people.find(p=>p.id===s?.personId);if(s?.status!=='open'||!target)canApply=false;
      return `<div class="conflict-row"><strong>${escapeHTML(p?.name||'Alumno')} · ${escapeHTML(target?.name||'Ejercicio eliminado')}</strong><p>${trainingFieldLabels[input.field]} guardado: <strong>${escapeHTML(valueLabel(target?.[input.field]))}</strong><br>Tu cambio pendiente: <strong>${escapeHTML(input.raw)}</strong></p>${s?.status!=='open'?'<p>Esta sesión ya se cerró. Para cambiar el resultado, usá Corregir en el historial.</p>':''}</div>`;
    }).join('');
    modal('Comparar cambios pendientes','Nada se aplicará hasta que elijas.',`${rows}<div class="actions">${canApply?btn('Aplicar mis cambios','train-conflict-apply','primary'):''}${btn('Descartar cambios pendientes','train-conflict-discard')}</div>`);return true;
  }
  if(kind==='train-conflict-apply'){await trainingController.retry();closeModal();render();return true}
  if(kind==='train-conflict-discard'){trainingController.discardPending();closeModal();render();return true}
  if(kind==='train-correct'){
    const s=DB.sessions.find(s=>s.id===id),b=s?.blocks.find(b=>b.id===bid),e=b?.exercises.find(e=>e.id===eid);if(!e)return true;
    modal('Corregir registro',e.name,`<p>El historial conservará los valores anteriores. La rutina vigente no cambia.</p>${valueControls(e,true)}`,'Guardar corrección',`train-correct-confirm:${id}:${bid}:${eid}`);return true;
  }
  if(kind==='train-correct-confirm'){
    const values=readControls($('#modal'));if(Object.keys(values).some(k=>!TrainingSchema.parseField(k,values[k]).ok))throw Error('Completá valores válidos.');
    await trainingController.flush();const op=uid();await trainingController.commit(op,s=>{for(const [field,value] of Object.entries(values))s=TrainingDomain.apply(s,{type:'correct',operationId:op,sessionId:id,blockId:bid,exerciseId:eid,field,value},trainingContext);return s},'domain');closeModal();render();return true;
  }
  if(kind==='backup-open'){
    modal('Copias de respaldo','Guardá una copia fuera de este dispositivo.',`<p>Incluye alumnos, rutinas, sesiones e historial confirmados. Los cambios pendientes no se incluyen.</p>${btn('Descargar copia JSON','backup-download','','download')}<hr><label class="field"><span>Restaurar una copia</span><input type="file" id="training-backup-file" accept="application/json,.json" class="backup-file"></label><p class="fineprint">La restauración reemplaza los datos actuales después de revisarla y confirmarla.</p><div id="backup-read-error" role="alert"></div>`);return true;
  }
  if(kind==='backup-download'){
    const blob=new Blob([TrainingBackup.exportText(trainingController.snapshot())],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`pulso-respaldo-${TODAY}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return true;
  }
  if(kind==='backup-restore'){
    if(!trainingBackupCandidate)throw Error('Elegí una copia.');
    await TrainingBackup.restore(trainingRepo,trainingBackupCandidate,{expectedRevision:trainingController.snapshot().revision,operationId:uid(),hasPending:trainingController.pending().length>0||DB.people.some(draftHasChanges)||trainingController.busy()||templateHasChanges()});
    await trainingController.reloadConflict();hydrateTraining(trainingController.snapshot(),false);state.sessionId=null;closeModal();go('agenda');toast('Copia restaurada.');return true;
  }
  return false;
}
document.addEventListener('input',event=>{
  const el=event.target;
  if(el.dataset.liveSession){trainingController.stage({sessionId:el.dataset.liveSession,blockId:el.dataset.blockId,exerciseId:el.dataset.exerciseId,field:el.dataset.field,raw:el.value});return}
  if(el.id==='training-person-search'){const q=normalize(el.value);for(const option of $('#training-person').options)option.hidden=!normalize(option.textContent).includes(q);const first=[...$('#training-person').options].find(o=>!o.hidden);if(first)$('#training-person').value=first.value}
});
document.addEventListener('focusout',event=>{if(event.target.dataset.liveSession)trainingController.flush(event.target.dataset.liveSession).catch(()=>{})});
document.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.dataset.liveSession){event.preventDefault();trainingController.flush(event.target.dataset.liveSession).catch(reportTrainingError)}});
document.addEventListener('change',async event=>{
  const el=event.target;
  try{
    if(el.dataset.liveSession&&el.tagName==='SELECT'){trainingController.stage({sessionId:el.dataset.liveSession,blockId:el.dataset.blockId,field:el.dataset.field,raw:el.value});await trainingController.flush(el.dataset.liveSession)}
    if(el.dataset.skipSession){await commitTraining({type:'skip',sessionId:el.dataset.skipSession,blockId:el.dataset.blockId,exerciseId:el.dataset.exerciseId,value:el.checked});render()}
    if(el.id==='training-backup-file'&&el.files[0]){
      trainingBackupCandidate=TrainingBackup.parse(await el.files[0].text());const db=trainingBackupCandidate.db;
      modal('Revisar copia antes de restaurar','Se reemplazarán los datos confirmados de este navegador.',`<div class="backup-summary"><strong>${db.people.length} alumnos</strong><span>${db.sessions.length} entrenamientos · ${db.sessions.filter(s=>s.status==='open').length} abiertos</span><span>${db.people.reduce((n,p)=>n+p.records.length,0)} resultados</span></div>${btn('Descargar copia actual primero','backup-download','','download')}<p>Este paso reemplaza la información actual por la copia elegida.</p>`,'Reemplazar y restaurar','backup-restore');
    }
  }catch(e){if(el.dataset.skipSession)el.checked=!el.checked;reportTrainingError(e)}
});
window.addEventListener('focus',async()=>{if(!trainingReady||trainingActionBusy||trainingController.busy())return;try{const oldDay=TODAY;await renewTrainingMonth();if(oldDay!==TODAY&&document.activeElement?.tagName!=='INPUT')render()}catch(e){reportTrainingError(e)}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&trainingReady)trainingController.flush().catch(()=>{})});
bootTraining();
