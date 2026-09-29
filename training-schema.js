/* Versioned data boundary. No storage or UI side effects. */
globalThis.TrainingSchema=(()=>{
  const fail=message=>{throw Object.assign(new Error(message),{code:'INVALID'})};
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const text=value=>typeof value==='string';
  const dateKey=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const isDate=value=>text(value)&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&dateKey(new Date(value+'T12:00:00'))===value;
  const isTime=value=>text(value)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const limits={weight:[0,150],sets:[1,4],reps:[1,15],microRest:[0,3600],macroRest:[0,3600]};
  function parseField(field,raw){
    if(field==='macroTarget')return ['series','blocks'].includes(raw)?{ok:true,value:raw}:{ok:false};
    if(!limits[field])return {ok:false};
    if((raw===''||raw===null)&&['microRest','macroRest'].includes(field))return {ok:true,value:null};
    if(!/^(0|[1-9]\d*)$/.test(String(raw)))return {ok:false};
    const value=Number(raw),[min,max]=limits[field];
    return Number.isSafeInteger(value)&&value>=min&&value<=max?{ok:true,value}:{ok:false};
  }
  function unique(rows,label){
    if(!Array.isArray(rows))fail(`Falta la lista de ${label}.`);
    const ids=new Set();for(const row of rows){if(!object(row)||!text(row.id)||!row.id||ids.has(row.id))fail(`Identificador inválido o repetido en ${label}.`);ids.add(row.id)}
  }
  function checkBlocks(blocks){
    unique(blocks,'bloques');
    for(const b of blocks){
      if(!text(b.name)||!['mobility','approximation','main'].includes(b.type)||!parseField('macroRest',b.macroRest).ok||!parseField('macroTarget',b.macroTarget).ok)fail('Bloque o descanso inválido.');
      unique(b.exercises,'ejercicios');
      for(const e of b.exercises){
        if(!text(e.name)||!text(e.group))fail('Ejercicio inválido.');
        for(const key of ['weight','sets','reps'])if(e[key]!==null&&e[key]!==undefined&&!parseField(key,e[key]).ok)fail(`Valor inválido: ${key}.`);
        if(!parseField('microRest',e.microRest).ok)fail('Descanso micro inválido.');
        if(e.skipped!==undefined&&typeof e.skipped!=='boolean')fail('Estado de ejercicio inválido.');
      }
    }
  }
  function checkRoutine(r){
    if(!r)return;
    if(!text(r.id)||!text(r.name)||!isDate(r.date)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.period)||!Array.isArray(r.weeks)||r.weeks.length!==4||!Number.isInteger(r.revision))fail('Rutina inválida.');
    for(const week of r.weeks){unique(week,'días');for(const day of week){if(!text(day.title)||!text(day.weekday))fail('Día inválido.');checkBlocks(day.blocks)}}
  }
  function validate(s){
    if(!object(s)||s.version!==6||!Number.isSafeInteger(s.revision)||s.revision<0||!Array.isArray(s.operationIds)||s.operationIds.some(id=>!text(id))||!object(s.db))fail('Formato de datos incompatible.');
    const db=s.db;unique(db.people,'alumnos');unique(db.templates,'plantillas');unique(db.library,'biblioteca');unique(db.visits,'visitas');unique(db.sessions,'sesiones');
    if(!db.people.length)fail('La copia no contiene alumnos.');
    for(const e of db.library)if(!text(e.name)||!e.name.trim()||!text(e.group)||!e.group.trim()||(e.notes!==undefined&&!text(e.notes)))fail('Entrada de biblioteca inválida.');
    if(!object(db.branding))fail('Configuración inválida.');
    const forbidden=new Set(['__proto__','prototype','constructor']);
    function safe(value){if(value&&typeof value==='object')for(const key of Object.keys(value)){if(forbidden.has(key))fail('Clave de datos no permitida.');safe(value[key])}}
    safe(s);
    for(const p of db.people){
      if(!text(p.name)||!Array.isArray(p.weekdays)||p.weekdays.some(v=>!['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].includes(v))||!Array.isArray(p.archives)||!Array.isArray(p.records)||!Array.isArray(p.history))fail('Datos del alumno incompletos.');
      for(const e of p.history)if(!object(e)||!text(e.id)||!isDate(e.date)||!text(e.type)||!text(e.title)||!Array.isArray(e.details)||e.details.some(d=>!text(d))||(e.recordedAt!==undefined&&!Number.isFinite(Date.parse(e.recordedAt))))fail('Evento de historial inválido.');
      checkRoutine(p.routine);checkRoutine(p.draft);for(const r of p.archives)checkRoutine(r);
      for(const r of p.records){if(!isDate(r.date)||!text(r.name)||!text(r.group)||['weight','sets','reps'].some(k=>!Number.isFinite(r[k])||r[k]<0))fail('Registro anterior inválido.');if(r.sessionId&&!db.sessions.some(x=>x.id===r.sessionId&&x.personId===p.id&&x.status==='closed'))fail('Resultado sin sesión finalizada.');}
    }
    for(const r of db.templates)checkRoutine(r);
    const openPeople=new Set();
    for(const v of db.visits){if(!db.people.some(p=>p.id===v.personId)||!isDate(v.date)||(v.time!==''&&!isTime(v.time))||!['pending','open','closed','absent','rescheduled'].includes(v.status))fail('Visita inválida.');for(const key of ['rescheduledFrom','rescheduledTo'])if(v[key]&&!db.visits.some(x=>x.id===v[key]&&x.personId===v.personId))fail('Reprogramación sin referencia.');}
    for(const session of db.sessions){
      const p=db.people.find(p=>p.id===session.personId),visit=db.visits.find(v=>v.id===session.visitId);
      if(!p||!visit||visit.personId!==p.id||!['open','closed'].includes(session.status)||!Number.isFinite(Date.parse(session.startedAt))||session.week<1||session.week>4||!Number.isInteger(session.week))fail('Sesión inválida.');
      if(![p.routine,...p.archives].some(r=>r?.id===session.routineId))fail('Sesión sin rutina de origen.');
      if(session.status==='open'){if(openPeople.has(p.id)||session.endedAt!==null||visit.status!=='open')fail('Sesión abierta duplicada o inconsistente.');openPeople.add(p.id)}
      else if(!Number.isFinite(Date.parse(session.endedAt))||visit.status!=='closed')fail('Cierre inválido.');
      checkBlocks(session.blocks);
    }
    return s;
  }
  function normalizeRoutine(r){
    if(!r)return r;
    r.period=r.period||r.date.slice(0,7);r.revision=r.revision||1;
    for(const week of r.weeks)for(const d of week){
      if(!d.blocks)d.blocks=['mobility','approximation','main'].map(type=>({id:`${d.id}-${type}`,name:{mobility:'Movilidad',approximation:'Aproximaciones',main:'Parte principal'}[type],type,macroRest:null,macroTarget:'series',exercises:d[type]||[]}));
      for(const type of ['mobility','approximation','main'])delete d[type];
      for(const b of d.blocks){b.macroRest??=null;b.macroTarget??='series';for(const e of b.exercises)e.microRest??=null}
    }
    return r;
  }
  function migrateV5(saved){
    if(saved?.version===6)return validate(structuredClone(saved));
    if(saved?.version!==5||!object(saved.db)||!Array.isArray(saved.db.people)||!saved.db.people.length)fail('Los datos previos no se pueden leer. Se conservan sin reemplazar.');
    const db=structuredClone(saved.db);db.visits=[];db.sessions=[];
    for(const p of db.people){
      p.history??=[];p.records??=[];p.archives??=[];
      [p.routine,p.draft,...p.archives].forEach(normalizeRoutine);
      if(p.attendanceDate&&isDate(p.attendanceDate))db.visits.push({id:`legacy-visit-${p.id}`,personId:p.id,date:p.attendanceDate,time:p.attendanceTime||p.scheduleTimes?.[['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][new Date(p.attendanceDate+'T12:00:00').getDay()]]||p.scheduleTime||'',status:p.attendance==='Confirmado'?'closed':p.attendance==='No asistió'?'absent':'pending',source:'schedule',rescheduledFrom:null,rescheduledTo:null,legacy:true});
    }
    db.templates.forEach(normalizeRoutine);
    return validate({version:6,revision:0,operationIds:[],serial:saved.serial||0,db});
  }
  return {validate,migrateV5,normalizeRoutine,parseField,dateKey,isDate,isTime,checkBlocks,defaultWeek:date=>Math.min(4,Math.floor((date.getDate()-1)/7)+1)};
})();
