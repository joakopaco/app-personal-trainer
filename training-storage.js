/* A single snapshot and its audit log commit together. Requests are not commits. */
globalThis.TrainingStorage=(()=>{
  const error=(code,message)=>Object.assign(new Error(message),{code});
  async function open({name='pulso-v6',indexedDB=globalThis.indexedDB}={}){
    if(!indexedDB)throw error('UNAVAILABLE','No se puede abrir el almacenamiento de este navegador.');
    const db=await new Promise((resolve,reject)=>{
      let settled=false;const request=indexedDB.open(name,1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('state'))request.result.createObjectStore('state')};
      request.onsuccess=()=>{if(settled){request.result.close();return}settled=true;resolve(request.result)};
      request.onerror=()=>{settled=true;reject(error('UNAVAILABLE','No se pudo abrir la base local.'))};
      request.onblocked=()=>{settled=true;reject(error('UNAVAILABLE','Cerrá las otras pestañas de Pulso y reintentá.'))};
    });
    db.onversionchange=()=>db.close();
    function run(mode,change){return new Promise((resolve,reject)=>{
      let result,failure;let tx;
      try{tx=db.transaction('state',mode)}catch{reject(error('UNAVAILABLE','La base local se cerró. Recargá la página.'));return}
      tx.oncomplete=()=>resolve(structuredClone(result));
      tx.onabort=()=>reject(failure||error('WRITE_FAILED','No se pudo guardar. Tus cambios siguen pendientes.'));
      tx.onerror=()=>{failure??=error('WRITE_FAILED','No se pudo guardar en este dispositivo.');};
      const store=tx.objectStore('state'),request=store.get('current');
      request.onsuccess=()=>{try{result=change(request.result??null,store)}catch(e){failure=e;tx.abort()}};
    })}
    return {
      load:()=>run('readonly',value=>value?TrainingSchema.validate(value):null),
      initialize:envelope=>run('readwrite',(current,store)=>{if(current)return TrainingSchema.validate(current);const valid=TrainingSchema.validate(structuredClone(envelope));store.put(valid,'current');return valid}),
      transact:({expectedRevision,operationId},reduce)=>run('readwrite',(current,store)=>{
        if(!current)throw error('UNAVAILABLE','No hay datos inicializados.');
        if(typeof operationId!=='string'||!operationId)throw error('INVALID','Falta la identidad de la operación.');
        if(current.operationIds.includes(operationId))return current;
        if(current.revision!==expectedRevision)throw error('CONFLICT','Otra pestaña guardó cambios. Revisá la versión nueva antes de continuar.');
        const candidate=reduce(structuredClone(current));
        candidate.version=6;candidate.revision=current.revision+1;candidate.operationIds=[...current.operationIds,operationId];
        TrainingSchema.validate(candidate);store.put(candidate,'current');return candidate;
      }),
      close:()=>db.close()
    };
  }
  return {open};
})();
