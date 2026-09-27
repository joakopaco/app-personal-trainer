let modalContext={};
function render(){saveViewContext();navigation();$('#main').innerHTML=views[state.page]();document.title=`Pulso — ${$('#breadcrumb').textContent}`}
function go(page){if(location.hash===`#${page}`){state.page=page;render()}else location.hash=page;window.scrollTo(0,0)}
function route(){let page=location.hash.slice(1);state.page=views[page]?page:'agenda';render();window.scrollTo(0,0)}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4500)}
function closeModal(){$('#modal').close()}
function modal(title,subtitle,body,saveLabel='',saveAction='close'){
  $('#modal-content').innerHTML=`<form id="modal-form"><div class="modal-header"><h2 id="modal-title">${title}</h2><button type="button" class="icon-btn" data-action="close" aria-label="Cerrar">${icon('close')}</button></div><p class="modal-subtitle">${subtitle}</p>${body}<p id="form-error" role="alert"></p><div class="modal-footer"><button type="button" class="btn" data-action="close">Volver</button>${saveLabel?`<button class="btn primary" type="submit">${saveLabel}</button>`:''}</div></form>`;
  $('#modal-form').addEventListener('submit',event=>{event.preventDefault();if(saveLabel)action(saveAction)});
  if(!$('#modal').open)$('#modal').showModal();
  $('#modal-form').querySelectorAll('button:not([type])').forEach(b=>b.type='button');
}
function error(message){$('#form-error').textContent=message}
function setStudent(i){state.templateId=null;state.draftMode=false;state.person=Number(i);state.archiveId=null;state.day=0;state.week=2;state.empty=false}
function sourceFromKey(key){const [kind,id]=key.split(':');return kind==='template'?DB.templates[Number(id)]:kind==='student'?DB.people[Number(id)].routine:kind==='archive'?person().archives.find(r=>r.id===id):null}
function routineWizard(sourceKey='blank'){
  const p=person();
  if(p.draft){showPendingDraft();return}
  modal('Crear un borrador',`${escapeHTML(p.name)} · Una rutina de 4 semanas, con sus días adentro.`,
  `<div class="wizard-step"><span>1</span>Elegí el punto de partida</div><label class="field"><span>Usar como base</span><select id="routine-source"><option value="blank">Desde cero · ${p.weekdays.length} días vacíos</option><optgroup label="Banco de rutinas">${DB.templates.map((r,i)=>`<option value="template:${i}" ${sourceKey===`template:${i}`?'selected':''}>${escapeHTML(r.name)} · ${r.weeks[0].length} días</option>`).join('')}</optgroup><optgroup label="Rutinas de otros alumnos">${DB.people.map((other,i)=>other.routine&&i!==state.person?`<option value="student:${i}" ${sourceKey===`student:${i}`?'selected':''}>${escapeHTML(other.name)} · ${other.routine.weeks[0].length} días</option>`:'').join('')}</optgroup>${p.archives.length?`<optgroup label="Rutinas anteriores de este alumno">${p.archives.map(r=>`<option value="archive:${r.id}" ${sourceKey===`archive:${r.id}`?'selected':''}>${escapeHTML(r.name)} · ${dateLabel(r.date)}</option>`).join('')}</optgroup>`:''}</select></label><div class="wizard-step"><span>2</span>Personalizá el nombre</div><label class="field"><span>Nombre de la rutina</span><input id="routine-name" value="${escapeHTML(sourceFromKey(sourceKey)?.name||'Rutina personalizada')}" required maxlength="90"></label><div class="modal-example">La base se copia completa. Podés dejarla tal cual o ajustar sus ejercicios y días. La original no cambia.${p.routine?'<br>Tu rutina actual sigue activa hasta que pulses «Activar rutina».':''}</div><p class="fineprint">Si la cantidad de días de la base no coincide con la asistencia del alumno, podrás agregar, quitar o asignar días en el editor.</p>`,'Crear borrador','save-routine');
}
function readControls(root){return Object.fromEntries(['weight','sets','reps'].map(key=>{const value=$(`[name="${key}"]`,root).value;return [key,value===''?null:Number(value)]}))}
function addExercise(id,zone){if(isRoutineReadOnly())return;const source=DB.library.find(e=>e.id===id);if(!source||!currentDay()||!zoneLabel[zone])return;const exercise={...copy(source),id:uid(),sets:null,reps:null,weight:null};mutateDays(d=>d[zone].push(copy(exercise)));closeModal();render();toast(`Ejercicio agregado a ${zoneLabel[zone].toLowerCase()}.`)}
function action(command){if(!lifecycleAction(command))runAction(command);persist()}
function runAction(command){const [kind,arg,extra]=command.split(':');
  if(kind==='history-more'){historyLimit+=15;render();return}
  if(kind==='close'){closeModal();return}
  if(kind==='open-current'){state.templateId=null;state.draftMode=false;state.archiveId=null;state.day=0;go('editor');return}
  if(kind==='open-day'){state.templateId=null;state.draftMode=false;state.archiveId=null;state.day=Number(arg);go('editor');return}
  if(kind==='archive'){state.templateId=null;state.draftMode=false;state.archiveId=arg;state.week=1;state.day=0;go('editor');return}
  if(kind==='routine-pdf'||kind==='current-pdf'){if(state.draftMode&&kind==='current-pdf')return;if(kind==='routine-pdf'){state.archiveId=null;state.draftMode=false;state.templateId=null;}state.document='routine';go('documents');return}
  if(kind==='progress-pdf'){state.document='progress';go('documents');return}
  if(kind==='create-routine'){routineWizard();return}
  if(kind==='copy-archive'){routineWizard(`archive:${arg}`);return}
  if(kind==='save-routine'){const name=$('#routine-name').value.trim();if(!name){error('Escribí un nombre para la rutina.');return}assignRoutine(sourceFromKey($('#routine-source').value));person().draft.name=name;persist();closeModal();go('editor');toast('Borrador creado. Pulsá Guardar borrador para conservarlo.');return}
  if(kind==='calendar'){showCalendar(arg||TODAY);return}
  if(kind==='reschedule'){
    modalContext={person:Number(arg)};
    const p=DB.people[arg],date=p.attendanceDate||TODAY,time=p.attendanceTime||scheduledTime(p,date);
    modal('Reprogramar visita',escapeHTML(p.name),`<p class="visit-current">Visita actual: <strong>${dateLabel(date)} · ${escapeHTML(time||'Sin horario')}</strong></p><label class="field"><span>Fecha de esta visita</span><input id="visit-date" type="date" value="${date}" required min="${TODAY}"></label><label class="field"><span>Horario de esta visita</span><input id="visit-time" type="time" value="${escapeHTML(time)}" required></label><div class="modal-example">Para cambiar solo la hora, conservá la fecha. Este cambio se aplica únicamente a esta visita; los días y horarios habituales del perfil se mantienen.</div>`,'Reprogramar','save-visit');return
  }
  if(kind==='save-visit'){
    const date=$('#visit-date').value,time=$('#visit-time').value;
    if(!date||date<TODAY||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)){error('Elegí una fecha desde hoy y completá el horario de la visita.');return}
    const p=DB.people[modalContext.person];
    recordHistory(p,'profile','Visita reprogramada',[`${dateLabel(p.attendanceDate||TODAY)} · ${p.attendanceTime||scheduledTime(p,p.attendanceDate||TODAY)||'Sin horario'} → ${dateLabel(date)} · ${time}`]);
    p.attendanceTime=time;p.attendanceDate=date;p.attendance='Reprogramado';
    closeModal();render();toast(`Visita reprogramada: ${dateLabel(date)} a las ${time}. Horarios habituales sin cambios.`);return
  }
  if(kind==='confirm'){
    const p=DB.people[Number(arg)],dayIndex=Math.min(p.sessionIndex,p.routine?.weeks[1].length-1);const d=p.routine?.weeks[1][dayIndex];
    if(!d){toast('Primero creá la rutina del alumno.');return}modalContext={person:Number(arg),dayIndex};
    modal('Confirmar entrenamiento',`${escapeHTML(p.name)} · Día ${dayIndex+1} · ${escapeHTML(d.title)}`,
      `<div class="confirmation-date">${icon('calendar')}23 de septiembre de 2026 · ${escapeHTML(p.attendanceTime||scheduledTime(p,TODAY)||'Sin horario')}</div><p class="modal-subtitle">Ajustá los valores que cambiaron. Confirmar registra lo realizado y la asistencia.</p>${Object.entries(zoneLabel).map(([zone,label])=>`<h3 class="confirm-zone-title">${label}</h3>${d[zone].map(e=>{const prior=p.records.find(r=>r.date===TODAY&&r.exerciseId===e.id&&r.routineId===p.routine.id);return `<div class="confirm-exercise" data-confirm-id="${e.id}" data-confirm-zone="${zone}"><strong>${escapeHTML(e.name)}</strong>${valueControls(prior||e,true)}</div>`}).join('')||'<p class="muted">Sin ejercicios.</p>'}`).join('')}<p class="fineprint">Estos valores corresponden a hoy. No cambian los pesos indicados para las próximas sesiones.</p>`,'Confirmar entrenamiento','save-confirmation');return
  }
  if(kind==='save-confirmation'){
    const p=DB.people[modalContext.person],d=p.routine.weeks[1][modalContext.dayIndex];
    const records=[...$('#modal').querySelectorAll('[data-confirm-id]')].map(row=>{const e=d[row.dataset.confirmZone].find(e=>e.id===row.dataset.confirmId);return {date:TODAY,name:e.name,group:e.group,...readControls(row),exerciseId:e.id,routineId:p.routine.id,zone:row.dataset.confirmZone,source:'session'}});
    if(records.some(r=>!completeExercise(r))){error('Completá peso, series y repeticiones de todos los ejercicios.');return}
    if(!saveSession(p,records)){error('No se pudo guardar el entrenamiento. Reintentá.');return}
    closeModal();render();toast('Entrenamiento guardado en el historial del alumno.');return
  }
  if(kind==='library'){modal('Biblioteca de ejercicios','Agregá un ejercicio sin arrastrar.',`<div class="library">${library()}</div>`);return}
  if(kind==='choose-zone'){modalContext={zone:arg};modal('Agregar ejercicio',zoneLabel[arg],`<label class="field"><span>Ejercicio</span><select id="add-exercise-id">${DB.library.map(e=>`<option value="${e.id}">${escapeHTML(e.name)}</option>`).join('')}</select></label>`,'Agregar','save-add-zone');return}
  if(kind==='save-add-zone'){addExercise($('#add-exercise-id').value,modalContext.zone);return}
  if(kind==='add-exercise'){modalContext={exerciseId:arg};modal('Agregar a la rutina',escapeHTML(DB.library.find(e=>e.id===arg).name),`<label class="field"><span>Zona del día ${state.day+1}</span><select id="add-zone">${Object.entries(zoneLabel).map(([key,name])=>`<option value="${key}" ${key==='main'?'selected':''}>${name}</option>`).join('')}</select></label>`,'Agregar','save-add');return}
  if(kind==='save-add'){addExercise(modalContext.exerciseId,$('#add-zone').value);return}
  if(kind==='edit-exercise'){
    const e=currentDay()[arg].find(e=>e.id===extra);modalContext={zone:arg,id:extra};
    modal('Editar ejercicio',`${escapeHTML(e.name)} · ${zoneLabel[arg]}`,`${valueControls(e)}<div class="modal-example">Se aplica a la semana ${state.week}${state.week<4?' y las siguientes':''}. Los otros ejercicios y las semanas anteriores se mantienen.</div><div class="actions spaced">${btn('Subir','move-up','compact','move')}${btn('Bajar','move-down','compact','move')}${btn('Quitar ejercicio','remove-exercise','text compact')}</div>`,'Guardar cambios','save-exercise');return
  }
  if(kind==='save-exercise'){const value=readControls($('#modal'));mutateDays(d=>{const e=d[modalContext.zone].find(e=>e.id===modalContext.id);if(e)Object.assign(e,value)});closeModal();render();toast('Ejercicio actualizado desde esta semana.');return}
  if(kind==='remove-exercise'){
    const zone=arg||modalContext.zone,id=extra||modalContext.id;
    if(isRoutineReadOnly()||!zoneLabel[zone]||!currentDay()?.[zone].some(e=>e.id===id))return;
    mutateDays(d=>d[zone]=d[zone].filter(e=>e.id!==id));
    closeModal();render();toast(`Ejercicio quitado de la semana ${state.week}${state.week<4?' y las siguientes':''}.`);return
  }
  if(kind==='move-up'||kind==='move-down'){mutateDays(d=>{const rows=d[modalContext.zone],i=rows.findIndex(e=>e.id===modalContext.id),j=i+(kind==='move-up'?-1:1);if(i>=0&&j>=0&&j<rows.length)[rows[i],rows[j]]=[rows[j],rows[i]]});closeModal();render();return}
  if(kind==='new-exercise'){modal('Crear ejercicio','Disponible en tu biblioteca para todas las rutinas.',`<label class="field"><span>Nombre</span><input id="exercise-name" required maxlength="90"></label><label class="field"><span>Grupo muscular</span><input id="exercise-group" list="exercise-groups" required maxlength="50"><datalist id="exercise-groups">${groupNames().map(g=>`<option value="${escapeHTML(g)}"></option>`).join('')}</datalist></label><label class="field"><span>Notas</span><input id="exercise-notes" maxlength="250"></label>`,'Crear ejercicio','save-new-exercise');return}
  if(kind==='save-new-exercise'){const name=$('#exercise-name').value.trim(),group=$('#exercise-group').value.trim();if(!group){error('Completá el grupo muscular.');return}if(!name){error('Escribí el nombre del ejercicio.');return}if(DB.library.some(e=>normalize(e.name)===normalize(name))){error('Ya hay un ejercicio con ese nombre.');return}DB.library.push({id:uid(),name,group,notes:$('#exercise-notes').value.trim()});closeModal();render();toast('Ejercicio agregado a la biblioteca de la demo.');return}
  if(kind==='edit-day'||kind==='add-day'){modalContext={newDay:kind==='add-day'};const d=currentDay();modal(kind==='add-day'?'Agregar día':'Editar día','Todos los días forman parte de la misma rutina.',`<label class="field"><span>Nombre del día</span><input id="day-name" required maxlength="90" value="${kind==='add-day'?'':escapeHTML(d.title)}" placeholder="Ej. Tren superior"></label><label class="field"><span>Día habitual</span><select id="day-weekday"><option>Sin asignar</option>${(state.templateId?WEEKDAYS:person().weekdays).map(w=>`<option ${w===d?.weekday?'selected':''}>${w}</option>`).join('')}</select></label>${kind==='edit-day'&&activeRoutine().weeks[0].length>1?btn('Quitar este día','remove-day','text compact'):''}`,'Guardar día','save-day');return}
  if(kind==='save-day'){const title=$('#day-name').value.trim(),weekday=$('#day-weekday').value;if(!title){error('Escribí el nombre del día.');return}const r=activeRoutine();if(modalContext.newDay){if(r.weeks[0].length>=5)return;const d={id:uid(),title,weekday,mobility:[],approximation:[],main:[]};r.weeks.forEach(w=>w.push(copy(d)));state.day=r.weeks[0].length-1;r.revision++}else{mutateDays(d=>Object.assign(d,{title,weekday}))}closeModal();render();return}
  if(kind==='remove-day'){const r=activeRoutine();if(r.weeks.some(w=>w.length<=1))return;r.weeks.forEach(w=>w.splice(state.day,1));state.day=0;r.revision++;closeModal();render();toast('Día quitado del borrador o plantilla.');return}
  if(kind==='preview-template'){const r=DB.templates[Number(arg)];modal(escapeHTML(r.name),'Una sola rutina con todos estos días.',`${r.weeks[0].map((d,i)=>`<div class="template-preview-day"><h3>Día ${i+1} · ${escapeHTML(d.title)}</h3><p>${d.mobility.length+d.approximation.length} ejercicios de entrada en calor</p><ul>${d.main.map(e=>`<li>${escapeHTML(e.name)} <span>${e.sets} × ${e.reps} · ${e.weight} kg</span></li>`).join('')}</ul></div>`).join('')}`);return}
  if(kind==='new-template'){modal('Nueva plantilla','Empezá desde cero con días vacíos.',`<label class="field"><span>Nombre de la plantilla</span><input id="template-name" required maxlength="90"></label><label class="field"><span>Cantidad de días</span><select id="template-days">${[1,2,3,4,5].map(n=>`<option value="${n}">${n}</option>`).join('')}</select></label>`,'Crear plantilla','save-empty-template');return}
  if(kind==='save-empty-template'){const name=$('#template-name').value.trim(),count=Number($('#template-days').value);if(!name||!Number.isInteger(count)||count<1||count>5){error('Completá el nombre y la cantidad de días.');return}const routine=emptyTemplate(name,count);DB.templates.push(routine);clearRoutineContext();state.templateId=routine.id;state.week=1;closeModal();go('editor');return}
  if(kind==='new-student'||kind==='edit-profile'){
    const fresh=kind==='new-student',p=person();modalContext={fresh};
    modal(fresh?'Crear alumno':'Editar información',fresh?'Primero sus datos. Después, su rutina personalizada.':'Estos son sus días habituales de asistencia.',`<div class="modal-grid"><label class="field"><span>Nombre</span><input id="student-first" required maxlength="50" value="${fresh?'':escapeHTML(p.name.split(' ')[0])}"></label><label class="field"><span>Apellido</span><input id="student-last" required maxlength="60" value="${fresh?'':escapeHTML(p.name.split(' ').slice(1).join(' '))}"></label></div><label class="field"><span>Género</span><select id="student-gender" required><option value="" disabled ${fresh||!p.gender?'selected':''}>Seleccioná una opción</option><option value="masculino" ${!fresh&&p.gender==='masculino'?'selected':''}>Masculino</option><option value="femenino" ${!fresh&&p.gender==='femenino'?'selected':''}>Femenino</option></select></label><label class="field"><span>Días por semana</span><select id="student-count">${[1,2,3,4,5].map(n=>`<option ${n===(fresh?3:p.weekdays.length)?'selected':''}>${n}</option>`).join('')}</select></label><div class="field"><span>Días habituales</span><div class="weekday-picker">${WEEKDAYS.map(d=>`<label><input type="checkbox" name="weekday" value="${d}" ${!fresh&&p.weekdays.includes(d)?'checked':''}><span>${d}</span></label>`).join('')}</div></div>${studentScheduleFields(p,fresh)}`,fresh?'Continuar a su rutina':'Guardar datos','save-student');return
  }
  if(kind==='save-student'){
    const scheduleTimes=Object.fromEntries([...$('#modal').querySelectorAll('[data-weekday-time]:enabled')].map(input=>[input.dataset.weekdayTime,input.value])),gender=$('#student-gender').value,first=$('#student-first').value.trim(),last=$('#student-last').value.trim(),weekdays=[...$('#modal').querySelectorAll('[name="weekday"]:checked')].map(i=>i.value),count=Number($('#student-count').value);if(!first||!last){error('Completá nombre y apellido.');return}if(!['masculino','femenino'].includes(gender)){error('Seleccioná el género.');return}if(weekdays.length!==count){error(`Seleccioná exactamente ${count} días habituales.`);return}
    if(modalContext.fresh){DB.people.push({id:uid(),name:`${first} ${last}`,initials:first[0]+last[0],gender,scheduleTimes,scheduleTime:'',color:'sage',weekdays,count,days:weekdays.join(' · '),routine:null,archives:[],records:[],attendance:'Pendiente',attendanceDate:weekdays.includes('Mié')?TODAY:'',sessionIndex:Math.max(0,weekdays.indexOf('Mié'))});setStudent(DB.people.length-1);recordHistory(person(),'profile','Alumno creado',[person().name]);go('profile');routineWizard()}
    else{const before=copy({name:person().name,gender:person().gender,weekdays:person().weekdays,scheduleTimes:person().scheduleTimes});Object.assign(person(),{name:`${first} ${last}`,initials:first[0]+last[0],gender,scheduleTimes,scheduleTime:'',weekdays,count,days:weekdays.join(' · ')});const after={name:person().name,gender:person().gender,weekdays:person().weekdays,scheduleTimes:person().scheduleTimes};const changes=[];if(before.name!==after.name)changes.push(`Nombre: ${before.name} → ${after.name}`);if(before.gender!==after.gender)changes.push(`Género: ${before.gender||'Sin especificar'} → ${after.gender}`);if(JSON.stringify(before.weekdays)!==JSON.stringify(after.weekdays)||JSON.stringify(before.scheduleTimes)!==JSON.stringify(after.scheduleTimes))changes.push(`Asistencia: ${before.weekdays.map(d=>`${d} ${before.scheduleTimes?.[d]||'Sin horario'}`).join(', ')} → ${after.weekdays.map(d=>`${d} ${after.scheduleTimes[d]||'Sin horario'}`).join(', ')}`);if(changes.length)recordHistory(person(),'profile','Datos del alumno actualizados',changes,{before,after});closeModal();render();toast('Datos del alumno actualizados.')}return
  }
  if(kind==='toggle-empty'){state.empty=!state.empty;render();return}
  if(kind==='custom-dates'){const start=$('#date-start').value,end=$('#date-end').value;if(!start||!end||start>end){toast('Elegí una fecha inicial anterior o igual a la final.');return}state.customStart=start;state.customEnd=end;state.empty=false;render();return}
  if(kind==='export-preview'){modal('Documento preparado','El archivo PDF real se implementará después de validar este formato.',`<div class="modal-example"><strong>${state.document==='routine'?'RUTINA':'PROGRESO'} — ${escapeHTML(person().name)} — 23/09/2026</strong><br>${state.document==='routine'?'Una sola rutina con todos los días y las 4 semanas.':rangeLabel()}<br>Logo y plantilla fijos del entrenador.</div>`);return}
}
document.addEventListener('click',event=>{
  const el=event.target.closest('[data-action],[data-person],[data-day],[data-week],[data-period],[data-group],[data-live]');if(!el)return;
  if(el.dataset.person!==undefined)setStudent(el.dataset.person);
  if(el.dataset.live){event.preventDefault();state.templateId=null;state.draftMode=false;state.archiveId=null;state.day=0;go(el.getAttribute('href').slice(1));return}
  if(el.dataset.day!==undefined){state.day=Number(el.dataset.day);render()}
  if(el.dataset.week){state.week=Number(el.dataset.week);render()}
  if(el.dataset.period){state.period=el.dataset.period;state.empty=false;render()}
  if(el.dataset.group){state.group=el.dataset.group;state.metricName='';render()}
  if(el.dataset.action)action(el.dataset.action);
});
document.addEventListener('input',event=>{
  if(event.target.id==='student-search')$('#student-rows').innerHTML=studentRows(event.target.value);
  if(event.target.id==='exercise-search'){const root=event.target.closest('.library');root.querySelectorAll('[data-exercise]').forEach(el=>el.classList.toggle('hide',!el.dataset.exercise.includes(normalize(event.target.value))));root.querySelectorAll('details').forEach(d=>{if(event.target.value)d.open=true})}
});
document.addEventListener('change',event=>{if(event.target.name==='weekday'){const field=$('#modal').querySelector(`[data-schedule-day="${event.target.value}"]`);field.hidden=!event.target.checked;field.querySelector('input').disabled=!event.target.checked}if(event.target.id==='metric-exercise'){state.metricName=event.target.value;render()}});
document.addEventListener('dragstart',event=>{const el=event.target.closest('[data-drag]');if(el){event.dataTransfer.setData('text/plain',el.dataset.drag);event.dataTransfer.effectAllowed='copy'}});
document.addEventListener('dragover',event=>{const zone=event.target.closest('[data-zone]');if(zone&&!isRoutineReadOnly()){event.preventDefault();zone.classList.add('drag-over');event.dataTransfer.dropEffect='copy'}});
document.addEventListener('dragleave',event=>{const zone=event.target.closest('[data-zone]');if(zone&&!zone.contains(event.relatedTarget))zone.classList.remove('drag-over')});
document.addEventListener('drop',event=>{const zone=event.target.closest('[data-zone]');if(zone&&!isRoutineReadOnly()){event.preventDefault();addExercise(event.dataTransfer.getData('text/plain'),zone.dataset.zone)}});
document.addEventListener('dragend',()=>document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over')));
$('#modal').addEventListener('click',event=>{if(event.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal()}});
window.addEventListener('hashchange',route);
route();

window.addEventListener('beforeunload',event=>{if(DB.people.some(draftHasChanges)){event.preventDefault();event.returnValue=''}});
