/* Pending UI strings never become durable state until the transaction completes. */
globalThis.TrainingController=(()=>{
  function create({repo,snapshot,context,onState=()=>{}}){
    let current=structuredClone(snapshot),tail=Promise.resolve(),active=0,failure=null,timer=null,drain=null,sequence=0;
    const inputs=new Map();
    const key=x=>JSON.stringify([x.sessionId,x.blockId,x.exerciseId||'',x.field]);
    function status(){
      if(failure)return {state:failure.error.code==='CONFLICT'?'conflict':'error',message:failure.error.message};
      if([...inputs.values()].some(x=>!x.valid))return {state:'error',message:'Revisá los campos marcados. Los valores anteriores siguen guardados.'};
      if(active||inputs.size)return {state:'saving',message:'Guardando…'};
      return {state:'saved',message:'Guardado en este dispositivo'};
    }
    const emit=()=>onState({...status(),snapshot:structuredClone(current)});
    function commit(operationId,reduce,kind='generic'){
      const work=tail.then(async()=>{
        if(failure)throw failure.error;
        active++;emit();
        try{current=await repo.transact({expectedRevision:current.revision,operationId},reduce);return structuredClone(current)}
        catch(error){failure={error,operationId,reduce,kind};throw error}
        finally{active--;emit()}
      });tail=work.catch(()=>{});return work;
    }
    function execute(command){command={...command,operationId:command.operationId||context.id()};return commit(command.operationId,s=>TrainingDomain.apply(s,command,context),'domain')}
    function stage(input){
      const parsed=TrainingSchema.parseField(input.field,input.raw);
      inputs.set(key(input),{...input,valid:parsed.ok,value:parsed.value,sequence:++sequence,operationId:context.id()});
      clearTimeout(timer);if(!failure)timer=setTimeout(()=>flush().catch(()=>{}),300);emit();
    }
    async function flush(sessionId){
      clearTimeout(timer);
      if(drain){await drain;return flush(sessionId)}
      drain=(async()=>{
        if(failure)throw failure.error;
        while(true){
          const next=[...inputs.values()].find(x=>x.valid&&(!sessionId||x.sessionId===sessionId));if(!next)break;
          const command={type:'edit',sessionId:next.sessionId,blockId:next.blockId,exerciseId:next.exerciseId,field:next.field,value:next.value,operationId:next.operationId};
          await execute(command);
          if(inputs.get(key(next))?.sequence===next.sequence)inputs.delete(key(next));emit();
        }
        if([...inputs.values()].some(x=>!x.valid&&(!sessionId||x.sessionId===sessionId)))throw Object.assign(new Error('Completá o corregí los campos marcados antes de finalizar.'),{code:'INVALID_INPUT'});
        await tail;
      })();
      try{return await drain}finally{drain=null;emit()}
    }
    async function retry(){
      const prior=failure;if(prior?.error.code==='CONFLICT')throw prior.error;failure=null;
      if(prior&&prior.kind==='generic')await commit(prior.operationId,prior.reduce);
      return flush();
    }
    async function reloadConflict(){
      await tail;const fresh=await repo.load();if(!fresh)throw new Error('No se encontraron datos.');
      current=fresh;failure=null;emit();return structuredClone(current);
    }
    return {stage,flush,execute,commit,retry,reloadConflict,status,snapshot:()=>structuredClone(current),pending:()=>structuredClone([...inputs.values()]),busy:()=>active>0,dispose:()=>clearTimeout(timer)};
  }
  return {create};
})();
