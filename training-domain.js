/* Pure transitions: every command is applied to a copy and committed by the repository. */
globalThis.TrainingDomain=(()=>{
  const fail=message=>{throw Object.assign(new Error(message),{code:'INVALID'})};
  function apply(envelope,c,ctx){
    const s=structuredClone(envelope),db=s.db,now=ctx.now(),stamp=now.toISOString();
    if(c.operationId&&s.operationIds.includes(c.operationId))return s;
    const student=id=>db.people.find(p=>p.id===id)||fail('No se encontró el alumno.');
    const event=(p,title,details,extra={})=>(p.history??=[]).push({id:ctx.id(),operationId:c.operationId||ctx.id(),date:TrainingSchema.dateKey(now),recordedAt:stamp,type:'changes',title,details,...extra});
    if(c.type==='start'){
      const p=student(c.personId),existing=db.sessions.find(x=>x.personId===p.id&&x.status==='open');if(existing)return s;
      if(!p.routine||!Number.isInteger(c.week)||c.week<1||c.week>4)fail('Elegí una rutina y una semana.');
      const day=p.routine.weeks[c.week-1].find(d=>d.id===c.dayId);if(!day||!day.blocks.some(b=>b.exercises.length))fail('El día elegido no tiene ejercicios.');
      if(!TrainingSchema.isDate(c.date)||!TrainingSchema.isTime(c.time))fail('Completá fecha y hora.');
      if(db.sessions.some(x=>x.id===c.sessionId))fail('La sesión ya existe.');
      let visit=c.visitId?db.visits.find(v=>v.id===c.visitId):null;
      if(c.visitId&&(!visit||visit.personId!==p.id||visit.status!=='pending'))fail('Esta visita no se puede iniciar.');
      if(!visit){visit={id:ctx.id(),personId:p.id,date:c.date,time:c.time,status:'pending',source:'walkin',rescheduledFrom:null,rescheduledTo:null};db.visits.push(visit)}
      visit.status='open';const blocks=structuredClone(day.blocks);for(const b of blocks)for(const e of b.exercises)e.skipped=false;
      db.sessions.push({id:c.sessionId||ctx.id(),personId:p.id,visitId:visit.id,routineId:p.routine.id,period:p.routine.period,dayId:day.id,dayTitle:day.title,week:c.week,startedAt:stamp,date:c.date,endedAt:null,status:'open',blocks});
      event(p,'Entrenamiento iniciado',[day.title,`${visit.date} · ${visit.time}`],{sessionId:db.sessions.at(-1).id});return s;
    }
    if(['absent','reschedule'].includes(c.type)){
      const v=db.visits.find(v=>v.id===c.visitId);if(!v||v.status!=='pending')fail('Solo se puede cambiar una visita pendiente.');const p=student(v.personId);
      if(c.type==='absent'){v.status='absent';event(p,'No asistió',[`${v.date} · ${v.time||'Sin horario'}`],{type:'profile',visitId:v.id});return s}
      if(!TrainingSchema.isDate(c.date)||c.date<TrainingSchema.dateKey(now)||!TrainingSchema.isTime(c.time))fail('Elegí una fecha desde hoy y una hora válida.');
      const id=c.newVisitId||ctx.id();if(db.visits.some(x=>x.id===id))fail('La visita de destino ya existe.');
      db.visits.push({...structuredClone(v),id,date:c.date,time:c.time,status:'pending',rescheduledFrom:v.id,rescheduledTo:null});v.status='rescheduled';v.rescheduledTo=id;
      event(p,'Visita reprogramada',[`${v.date} ${v.time} → ${c.date} ${c.time}`],{type:'profile',visitId:v.id});return s;
    }
    const session=db.sessions.find(x=>x.id===c.sessionId);if(!session)fail('No se encontró el entrenamiento.');const p=student(session.personId);
    if(c.type==='finish'){
      if(session.status==='closed')return s;
      const rows=session.blocks.flatMap(b=>b.exercises.filter(e=>!e.skipped).map(e=>({b,e})));
      for(const {e} of rows)if(['weight','sets','reps'].some(key=>!TrainingSchema.parseField(key,e[key]).ok))fail(`Completá los valores de ${e.name} o marcá que no se realizó.`);
      session.status='closed';session.endedAt=stamp;db.visits.find(v=>v.id===session.visitId).status='closed';
      for(const {b,e} of rows)p.records.push({date:session.date,startedAt:session.startedAt,recordedAt:stamp,sessionId:session.id,routineId:session.routineId,blockId:b.id,blockName:b.name,exerciseId:e.id,name:e.name,group:e.group,weight:e.weight,sets:e.sets,reps:e.reps,microRest:e.microRest,macroRest:b.macroRest,macroTarget:b.macroTarget,zone:b.type,source:'session'});
      event(p,'Entrenamiento finalizado',[`${rows.length} ejercicios realizados`,`${session.blocks.flatMap(b=>b.exercises).filter(e=>e.skipped).length} omitidos`],{sessionId:session.id});return s;
    }
    if(c.type==='correct'?session.status!=='closed':session.status!=='open')fail('El estado de este entrenamiento no permite ese cambio.');
    const b=session.blocks.find(b=>b.id===c.blockId);if(!b)fail('No se encontró el bloque.');const e=c.exerciseId?b.exercises.find(e=>e.id===c.exerciseId):null;
    if(c.exerciseId&&!e)fail('No se encontró el ejercicio.');
    if(c.type==='skip'){
      if(!e||typeof c.value!=='boolean')fail('Estado inválido.');const before=e.skipped;if(before===c.value)return s;e.skipped=c.value;event(p,c.value?'Ejercicio omitido':'Ejercicio incluido',[e.name],{sessionId:session.id,blockId:b.id,exerciseId:e.id,field:'skipped',before,after:c.value});return s;
    }
    if(!['edit','correct'].includes(c.type))fail('Acción no reconocida.');
    const fields=e?['weight','sets','reps','microRest']:['macroRest','macroTarget'];if(!fields.includes(c.field))fail('Campo inválido.');
    const parsed=TrainingSchema.parseField(c.field,c.value);if(!parsed.ok)fail('El valor está fuera del rango permitido.');
    const target=e||b,before=target[c.field];if(before===parsed.value)return s;
    if(c.type==='correct'&&e?.skipped)fail('Este ejercicio no se registró como realizado.');target[c.field]=parsed.value;
    if(c.type==='edit'){
      if(p.routine?.id!==session.routineId)fail('La rutina cambió; revisá esta sesión antes de continuar.');
      for(let w=session.week-1;w<4;w++){
        const day=p.routine.weeks[w].find(d=>d.id===session.dayId),block=day?.blocks.find(x=>x.id===b.id),row=e?block?.exercises.find(x=>x.id===e.id):block;
        if(row)row[c.field]=parsed.value;
      }
      p.routine.revision++;
    }else{
      const records=p.records.filter(r=>r.sessionId===session.id&&r.blockId===b.id&&(!e||r.exerciseId===e.id));
      if(!records.length)fail('No hay resultado para corregir.');for(const r of records)r[c.field]=parsed.value;
    }
    const labels={weight:'Peso',sets:'Series',reps:'Repeticiones',microRest:'Descanso micro',macroRest:'Descanso macro',macroTarget:'Aplicación del descanso'};
    event(p,c.type==='correct'?'Registro de entrenamiento corregido':'Ajuste durante el entrenamiento',[`${e?.name||b.name} · ${labels[c.field]}: ${before??'Sin definir'} → ${parsed.value??'Sin definir'}`],{sessionId:session.id,routineId:session.routineId,blockId:b.id,exerciseId:e?.id||null,field:c.field,before,after:parsed.value});return s;
  }
  return {apply};
})();
