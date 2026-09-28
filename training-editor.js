/* Structural editing remains a manually saved draft; live sessions use their own inputs. */
const routineInvalidInputs=new Map();
function restoreRoutineInputs(){
  const r=activeRoutine();if(!r)return;
  for(const [key,v] of routineInvalidInputs){
    const routine=DB.templates.find(r=>r.id===v.routineId)||DB.people.map(p=>p.draft).find(r=>r?.id===v.routineId),day=routine?.weeks[v.week-1]?.find(d=>d.id===v.dayId),b=day?.blocks.find(b=>b.id===v.blockId);
    if(!b||(v.exerciseId&&!b.exercises.some(e=>e.id===v.exerciseId))){routineInvalidInputs.delete(key);continue}
  }
  for(const el of document.querySelectorAll('[data-routine-block]')){
    const key=[r.id,state.week,state.day,el.dataset.routineBlock,el.dataset.exerciseId||'',el.dataset.field].join('|'),entry=routineInvalidInputs.get(key);
    if(entry){el.value=entry.raw;el.setAttribute('aria-invalid','true');const msg=el.parentElement.querySelector('.field-error');if(msg)msg.textContent='Revisá el valor'}
  }
}
function editorHasInvalid(){return [...routineInvalidInputs.values()].some(v=>v.routineId===activeRoutine()?.id)}
function blockActivation(){
  const p=person();
  if(DB.sessions?.some(s=>s.personId===p.id&&s.status==='open')){modal('Hay un entrenamiento abierto','Finalizalo antes de activar otra rutina.','<p>Así se conserva la rutina y el historial de esa sesión.</p>');return true}
  if(editorHasInvalid()){modal('Revisá los valores','Hay un campo inválido.','<p>Corregí los campos marcados antes de guardar o activar.</p>');return true}
  const differences=TrainingMonths.draftDifferences(p);if(!differences.length)return false;
  modalContext={draftDifferences:differences};
  if(differences.some(d=>d.structural)){
    modal('La rutina cambió desde este borrador','Hay cambios de estructura o posiciones que necesitan una base actualizada.',`<p>Podés volver al borrador para revisarlo o reemplazarlo por una copia de la rutina actual. Reemplazar elimina únicamente este borrador.</p>${btn('Reemplazar por la actual','block-rebase-confirm','primary')}`);return true;
  }
  modal('Revisar cargas actualizadas','El entrenamiento cambió valores después de crear este borrador.',differences.map((d,i)=>`<div class="conflict-row"><strong>Semana ${d.week} · ${escapeHTML(d.name||'Bloque')} · ${trainingFieldLabels[d.field]}</strong><label><input type="radio" name="draft-resolution-${i}" value="current" checked> Conservar vigente: ${escapeHTML(valueLabel(d.current))}</label><label><input type="radio" name="draft-resolution-${i}" value="draft"> Usar borrador: ${escapeHTML(valueLabel(d.draft))}</label></div>`).join(''),'Resolver y guardar borrador','block-resolve');return true;
}
function addExercise(id,blockId){
  if(isRoutineReadOnly())return;const source=DB.library.find(e=>e.id===id),block=currentDay()?.blocks.find(b=>b.id===blockId||b.type===blockId);
  if(!source||!block)return;
  const exercise={...copy(source),id:uid(),sets:null,reps:null,weight:null,microRest:null};
  mutateDays(d=>{const target=d.blocks.find(b=>b.id===block.id);if(target)target.exercises.push(copy(exercise))});closeModal();render();
}
async function trainingEditorAction(command){
  const [kind,id,eid]=command.split(':');
  if(kind==='save-draft'&&editorHasInvalid()){throw Error('Corregí el campo inválido antes de guardar el borrador.')}
  if(kind==='block-template-save'){
    if(editorHasInvalid())throw Error('Corregí los campos marcados.');if(!await persist())throw Error('No se pudo guardar la plantilla. Reintentá.');render();toast('Plantilla guardada.');return true;
  }
  if(kind==='block-resolve'){
    const p=person();for(const [i,d] of modalContext.draftDifferences.entries())if($(`input[name="draft-resolution-${i}"]:checked`).value==='current'){
      const day=p.draft.weeks[d.week-1].find(x=>x.id===d.dayId),b=day?.blocks.find(x=>x.id===d.blockId),e=d.exerciseId?b?.exercises.find(x=>x.id===d.exerciseId):b;if(e)e[d.field]=d.current;
    }
    p.draft.baseRoutine=copy(p.routine);if(!await saveDraft(p))throw Error('No se pudo guardar la resolución.');closeModal();render();return true;
  }
  if(kind==='block-rebase-confirm'){
    if(!await discardDraft(person()))throw Error('No se pudo reemplazar el borrador.');assignRoutine(person().routine);closeModal();go('editor');return true;
  }
  if(!kind.startsWith('block-')&&kind!=='add-exercise')return false;
  if(isRoutineReadOnly())return true;
  if(kind==='block-add'||kind==='block-rename'){
    const b=currentDay().blocks.find(b=>b.id===id);modalContext={blockId:b?.id};
    modal(b?'Editar bloque':'Agregar bloque','Podés agregar todos los bloques que necesites.',`<label class="field"><span>Nombre del bloque</span><input id="block-name" value="${escapeHTML(b?.name||'')}" maxlength="90" required placeholder="Ej. Fuerza · Tren superior"></label><label class="field"><span>Tipo</span><select id="block-type">${Object.entries(zoneLabel).map(([key,label])=>`<option value="${key}" ${key===(b?.type||'main')?'selected':''}>${label}</option>`).join('')}</select></label>`,'Guardar bloque','block-save');return true;
  }
  if(kind==='block-save'){
    const name=$('#block-name').value.trim(),type=$('#block-type').value;if(!name)throw Error('Escribí un nombre para el bloque.');
    const id=modalContext.blockId||uid();mutateDays(d=>{const b=d.blocks.find(b=>b.id===id);if(b)Object.assign(b,{name,type});else d.blocks.push({id,name,type,macroRest:null,macroTarget:'series',exercises:[]})});closeModal();render();return true;
  }
  if(kind==='block-remove'){modal('Quitar bloque','Se quita de esta semana y las siguientes.','<p>La rutina actual y los entrenamientos anteriores se conservan.</p>','Quitar',`block-remove-confirm:${id}`);return true}
  if(kind==='block-remove-confirm'){mutateDays(d=>d.blocks=d.blocks.filter(b=>b.id!==id));closeModal();render();return true}
  if(kind==='block-up'||kind==='block-down'){mutateDays(d=>{const i=d.blocks.findIndex(b=>b.id===id),j=i+(kind==='block-up'?-1:1);if(i>=0&&j>=0&&j<d.blocks.length)[d.blocks[i],d.blocks[j]]=[d.blocks[j],d.blocks[i]]});render();return true}
  if(kind==='block-ex-add'){
    modalContext={blockId:id};modal('Agregar ejercicio','Se agregará con sus valores sin definir.',`<label class="field"><span>Ejercicio</span><select id="block-exercise">${DB.library.map(e=>`<option value="${e.id}">${escapeHTML(e.name)}</option>`).join('')}</select></label>`,'Agregar','block-ex-save');return true;
  }
  if(kind==='block-ex-save'){addExercise($('#block-exercise').value,modalContext.blockId);return true}
  if(kind==='add-exercise'){
    modalContext={exerciseId:id};modal('Agregar ejercicio','Elegí el bloque de destino.',`<label class="field"><span>Bloque</span><select id="block-target">${currentDay().blocks.map(b=>`<option value="${b.id}">${escapeHTML(b.name)}</option>`).join('')}</select></label>`,'Agregar','block-target-confirm');return true;
  }
  if(kind==='block-target-confirm'){addExercise(modalContext.exerciseId,$('#block-target').value);return true}
  if(kind==='block-drop'){addExercise(eid,id);return true}
  if(kind==='block-ex-remove'){mutateDays(d=>{const b=d.blocks.find(b=>b.id===id);if(b)b.exercises=b.exercises.filter(e=>e.id!==eid)});render();return true}
  if(kind==='block-ex-up'||kind==='block-ex-down'){mutateDays(d=>{const b=d.blocks.find(b=>b.id===id);if(!b)return;const i=b.exercises.findIndex(e=>e.id===eid),j=i+(kind==='block-ex-up'?-1:1);if(i>=0&&j>=0&&j<b.exercises.length)[b.exercises[i],b.exercises[j]]=[b.exercises[j],b.exercises[i]]});render();return true}
  return false;
}
function handleRoutineInput(el){
  if(!el.dataset.routineBlock||isRoutineReadOnly())return;
  const raw=el.value,field=el.dataset.field,parsed=raw===''&&['weight','sets','reps'].includes(field)?{ok:true,value:null}:TrainingSchema.parseField(field,raw);
  const key=[activeRoutine().id,state.week,state.day,el.dataset.routineBlock,el.dataset.exerciseId||'',field].join('|');
  el.setAttribute('aria-invalid',String(!parsed.ok));const msg=el.parentElement.querySelector('.field-error');if(msg)msg.textContent=parsed.ok?'':'Revisá el valor';
  if(!parsed.ok){routineInvalidInputs.set(key,{routineId:activeRoutine().id,week:state.week,dayId:currentDay().id,blockId:el.dataset.routineBlock,exerciseId:el.dataset.exerciseId,raw});return}routineInvalidInputs.delete(key);
  mutateDays(d=>{const b=d.blocks.find(b=>b.id===el.dataset.routineBlock),target=el.dataset.exerciseId?b?.exercises.find(e=>e.id===el.dataset.exerciseId):b;if(target)target[field]=parsed.value});
  const status=$('.save-state');if(status)status.textContent='Cambios sin guardar · Guardá '+(state.templateId?'la plantilla':'el borrador');
}
document.addEventListener('input',event=>{if(event.target.tagName!=='SELECT')handleRoutineInput(event.target)});
document.addEventListener('change',event=>{if(event.target.tagName==='SELECT')handleRoutineInput(event.target)});
