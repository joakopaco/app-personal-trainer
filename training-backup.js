globalThis.TrainingBackup=(()=>{
  const invalid=message=>Object.assign(new Error(message),{code:'INVALID'});
  function exportText(snapshot){TrainingSchema.validate(snapshot);return JSON.stringify({format:'pulso-backup',exportedAt:new Date().toISOString(),data:snapshot},null,2)}
  function parse(text){
    let value;try{value=JSON.parse(text)}catch{throw invalid('El archivo no es un JSON válido. No se reemplazaron tus datos.')}
    if(value?.format!=='pulso-backup')throw invalid('No es una copia de Pulso.');return TrainingSchema.validate(value.data);
  }
  async function restore(repo,backup,{expectedRevision,operationId,hasPending}){
    if(hasPending)throw invalid('Guardá o resolvé los cambios pendientes antes de restaurar.');TrainingSchema.validate(backup);
    return repo.transact({expectedRevision,operationId},current=>{
      if(current.db.sessions.some(s=>s.status==='open'))throw invalid('Finalizá los entrenamientos abiertos antes de reemplazar los datos.');
      return {...structuredClone(backup),revision:current.revision,operationIds:current.operationIds};
    });
  }
  return {exportText,parse,restore};
})();
