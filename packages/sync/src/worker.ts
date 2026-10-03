import type {CloudGateway} from '@pulso/domain/contracts';
import type {LocalStore} from './local-db';
export async function drainStudent(store:LocalStore,studentId:string,gateway:CloudGateway,force=false,isActive=()=>true){
 const owner=crypto.randomUUID(),leaseId='send:'+studentId;
 if(!isActive()||!await store.acquireLease(leaseId,owner))return;
 try{
  for(let batch=0;batch<100&&isActive();batch++){
   const next=(await store.listPending(studentId))[0];if(!next||next.state==='conflict'||next.state==='rejected'||(!force&&(next.nextAttempt>Date.now()||next.attempts>=5)))break;
   if(!await store.acquireLease(leaseId,owner))break;
   await store.outbox.update(next.seq!,{state:'sending',frozen:true});
   try{
    if(!isActive())break;
    const reply=await gateway.execute(next.command);
    if(!isActive())break;
    await store.acknowledge(next.operationId,reply);
    if(reply.status==='conflict'||reply.status==='rejected')break;
   }catch(error){
    if(!isActive())break;
    const auth=(error as {code?:string}).code==='AUTH_REQUIRED';
    await store.outbox.update(next.seq!,{state:'queued',attempts:next.attempts+1,nextAttempt:Date.now()+Math.min(60_000,1000*2**next.attempts)*(1+Math.random()*.2),error:auth?'Volvé a ingresar a esta misma cuenta.':'No hubo confirmación del servidor. El cambio sigue en este dispositivo.'});break;
   }
  }
 }finally{if(store.isOpen())await store.releaseLease(leaseId,owner);}
}
