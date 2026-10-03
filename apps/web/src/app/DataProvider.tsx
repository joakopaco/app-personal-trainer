import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import {liveQuery} from 'dexie';
import {LocalStore,type StoredStudent,type PendingCommand} from '@pulso/sync/local-db';
import {drainStudent} from '@pulso/sync/worker';
import type {CommandEnvelope,CommandKind,StudentSnapshot} from '@pulso/domain/contracts';
import {useAuth} from '../features/auth/AuthProvider';
import {gateway} from '../adapters/supabase-gateway';
import {cloud} from '../adapters/supabase';
type DataValue={db:LocalStore;rows:StoredStudent[];pending:PendingCommand[];error:string;refresh:()=>Promise<void>;sync:(force?:boolean)=>Promise<void>;onlineCommand:(studentId:string,kind:CommandKind,payload:Record<string,unknown>,revision:number)=>Promise<StudentSnapshot>;makeCommand:(studentId:string,kind:CommandKind,payload:Record<string,unknown>,revision:number)=>CommandEnvelope};
const Context=createContext<DataValue|null>(null);
export function DataProvider({children}:{children:ReactNode}){
 const{scope}=useAuth();const db=useMemo(()=>new LocalStore(scope!),[scope!.userId,scope!.workspaceId]);const api=useMemo(()=>gateway(scope!),[db]);
 const[rows,setRows]=useState<StoredStudent[]>([]),[pending,setPending]=useState<PendingCommand[]>([]),[error,setError]=useState('');
 const deviceId=useMemo(()=>{const key='pulso-device';let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);}return id;},[]);
 async function refresh(){try{let from=0;const ids:string[]=[];while(true){const{data,error}=await cloud().from('students').select('id').eq('workspace_id',db.scope.workspaceId).order('id').range(from,from+99);if(error)throw error;ids.push(...data.map(s=>s.id));if(data.length<100)break;from+=100;}for(const id of ids){const snapshot=await api.fetchStudent(db.scope,id);await db.cache(snapshot);}setError('');}catch{setError('Sin conexión al servidor. Podés trabajar con los alumnos ya descargados.');}}
 async function sync(force=false){const ids=[...new Set((await db.listPending()).map(p=>p.studentId))];await Promise.all(ids.map(id=>drainStudent(db,id,api,force,()=>db.isOpen())));}
 useEffect(()=>{let active=true;void db.open().catch(()=>{if(active)setError('No se pudo abrir el almacenamiento de este dispositivo. No se pueden guardar cambios.');});
  const sub=liveQuery(async()=>({rows:await db.students.toArray(),pending:await db.listPending()})).subscribe({next:result=>{if(active){setRows(result.rows);setPending(result.pending);}},error:()=>{if(active)setError('No se pudo leer el almacenamiento local.');}});
  const tick=()=>{if(active)void sync().catch(()=>{});};const update=()=>{tick();if(active)void refresh();};void refresh();const interval=setInterval(tick,2500);window.addEventListener('online',update);window.addEventListener('focus',update);
  const channel=cloud().channel('students:'+db.scope.workspaceId).on('postgres_changes',{event:'UPDATE',schema:'public',table:'students',filter:'workspace_id=eq.'+db.scope.workspaceId},()=>{if(active)void refresh();}).subscribe();
  return()=>{active=false;sub.unsubscribe();clearInterval(interval);window.removeEventListener('online',update);window.removeEventListener('focus',update);void cloud().removeChannel(channel);};
 },[db]);
 function makeCommand(studentId:string,kind:CommandKind,payload:Record<string,unknown>,revision:number):CommandEnvelope{return {schemaVersion:1,operationId:crypto.randomUUID(),deviceId,workspaceId:db.scope.workspaceId,studentId,expectedRevision:revision,capturedAt:new Date().toISOString(),kind,payload};}
 async function onlineCommand(studentId:string,kind:CommandKind,payload:Record<string,unknown>,revision:number){
  if((await db.listPending(studentId)).length||await db.rawInputs.where('studentId').equals(studentId).count())throw Error('Sincronizá los cambios de este alumno antes de modificar su programación.');
  const key='admin:'+studentId;const old=await db.meta.get(key);let command:CommandEnvelope;
  if(old){command=old.value as CommandEnvelope;if(command.kind!==kind||JSON.stringify(command.payload)!==JSON.stringify(payload))throw Error('Hay una operación administrativa sin confirmar. Reintentala desde Ajustes.');}
  else{command=makeCommand(studentId,kind,payload,revision);await db.meta.put({key,value:command});}
  const reply=await api.execute(command);
  await db.meta.delete(key);
  if(reply.status==='rejected')throw Error(reply.message);
  if(reply.status==='conflict'){await db.cache(reply.current);throw Error('Los datos cambiaron en otro dispositivo. Revisá la versión actual antes de guardar.');}
  await db.cache(reply.patch);return reply.patch;
 }
 return <Context.Provider value={{db,rows,pending,error,refresh,sync,onlineCommand,makeCommand}}>{children}</Context.Provider>;
}
export function useData(){const data=useContext(Context);if(!data)throw Error('DataProvider required');return data;}
