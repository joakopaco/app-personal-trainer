globalThis.TrainingMonths=(()=>{
  function renew(envelope,date,ctx){
    const s=structuredClone(envelope),day=TrainingSchema.dateKey(date),month=day.slice(0,7);
    for(const p of s.db.people){
      if(!p.routine||p.routine.period>=month||s.db.sessions.some(x=>x.personId===p.id&&x.status==='open'))continue;
      const previous=structuredClone(p.routine);p.archives.unshift(previous);
      p.routine={...structuredClone(previous),id:ctx.id(),period:month,date:day,activatedAt:day,revision:1,continuedFrom:previous.id};
      p.history.push({id:ctx.id(),date:day,recordedAt:ctx.now().toISOString(),type:'routine',title:'Continuidad mensual',details:[`${previous.period} → ${month}`,`Continúa ${previous.name} con sus últimos valores.`],routineId:p.routine.id});
    }return s;
  }
  function draftDifferences(p){
    if(!p.draft||!p.routine)return [];
    const differences=[],base=p.draft.baseRoutine;
    if(base&&JSON.stringify(base)===JSON.stringify(p.routine))return [];
    for(let w=0;w<4;w++)for(const d of p.routine.weeks[w]){
      const bd=base?.weeks?.[w]?.find(v=>v.id===d.id),dd=p.draft.weeks[w].find(v=>v.id===d.id);
      if(!dd){if(!bd||JSON.stringify(d)!==JSON.stringify(bd))differences.push({structural:true,week:w+1,dayId:d.id,field:'day',current:d.title,draft:'No existe en borrador'});continue}
      for(const b of d.blocks){
        const bb=bd?.blocks.find(v=>v.id===b.id),db=dd.blocks.find(v=>v.id===b.id);
        if(!db){if(!bb||JSON.stringify(b)!==JSON.stringify(bb))differences.push({structural:true,week:w+1,dayId:d.id,blockId:b.id,field:'block',current:b.name,draft:'No existe en borrador'});continue}
        for(const field of ['macroRest','macroTarget'])if(b[field]!==db[field]&&(!base||b[field]!==bb?.[field]))differences.push({week:w+1,dayId:d.id,blockId:b.id,field,base:bb?.[field],current:b[field],draft:db[field]});
        for(const e of b.exercises){const be=bb?.exercises.find(v=>v.id===e.id),de=db.exercises.find(v=>v.id===e.id);if(!de){if(!base||JSON.stringify(e)!==JSON.stringify(be))differences.push({structural:true,week:w+1,dayId:d.id,blockId:b.id,exerciseId:e.id,field:'exercise',current:e.name,draft:'Eliminado'});continue}
          for(const field of ['weight','sets','reps','microRest'])if(e[field]!==de[field]&&(!base||e[field]!==be?.[field]))differences.push({week:w+1,dayId:d.id,blockId:b.id,exerciseId:e.id,name:e.name,field,base:be?.[field],current:e[field],draft:de[field]});
        }
      }
    }return differences;
  }
  return {renew,draftDifferences};
})();
