import 'fake-indexeddb/auto';
import {expect,test} from 'vitest';
import {LocalStore} from '@pulso/sync/local-db';
import {drainStudent} from '@pulso/sync/worker';
import {routineFixture} from '../fixtures/routine';
import {projectCommand} from '@pulso/domain/session-projection';
import type {AccountScope,CommandEnvelope,StudentSnapshot} from '@pulso/domain/contracts';
function fixture(){const scope={userId:crypto.randomUUID(),workspaceId:crypto.randomUUID()};const studentId=crypto.randomUUID();const routine=routineFixture();const snapshot:StudentSnapshot={student:{id:studentId,workspace_id:scope.workspaceId,name:'Ana',alias:'',notes:'',archived:false,revision:1,created_at:new Date().toISOString()},revision:1,period:{id:crypto.randomUUID(),month:'2026-10',current_revision_id:crypto.randomUUID(),continued_from:null},routine:{id:crypto.randomUUID(),document:routine},sessions:[],visits:[]};const command:CommandEnvelope={schemaVersion:1,operationId:crypto.randomUUID(),deviceId:crypto.randomUUID(),workspaceId:scope.workspaceId,studentId,expectedRevision:1,capturedAt:new Date().toISOString(),kind:'start_session',payload:{sessionId:crypto.randomUUID(),dayId:routine.weeks[0][0].id,week:1,periodId:snapshot.period!.id,routineRevisionId:snapshot.routine!.id,date:'2026-10-03'}};return{scope,snapshot,command};}
test('durable command survives reopening and a lost response uses the same operation id',async()=>{
 const{scope,snapshot,command}=fixture();let db=new LocalStore(scope);await db.cache(snapshot);await db.stage(command);
 db.close();db=new LocalStore(scope);expect((await db.listPending()).map(x=>x.command.operationId)).toEqual([command.operationId]);
 let serverCalls=0;let serverCommits=0;const applied=new Set<string>();
 const gateway={fetchStudent:async()=>snapshot,execute:async(c:CommandEnvelope)=>{serverCalls++;if(!applied.has(c.operationId)){applied.add(c.operationId);serverCommits++;throw Error('response lost');}return {status:'duplicate' as const,operationId:c.operationId,revision:2,patch:{...projectCommand(snapshot,c),revision:2}};}};
 await drainStudent(db,command.studentId,gateway);expect(await db.listPending()).toHaveLength(1);db.close();db=new LocalStore(scope);
 await drainStudent(db,command.studentId,gateway,true);expect(serverCalls).toBe(2);expect(serverCommits).toBe(1);expect(await db.listPending()).toHaveLength(0);expect((await db.read(command.studentId))?.confirmed.revision).toBe(2);await db.delete();
});
test('other account cannot stage work or see private cache',async()=>{const{scope,snapshot,command}=fixture();const a=new LocalStore(scope);const b=new LocalStore({...scope,userId:crypto.randomUUID(),workspaceId:crypto.randomUUID()});await a.cache(snapshot);expect(await b.read(command.studentId)).toBeUndefined();await expect(b.stage(command)).rejects.toThrow();await a.delete();await b.delete();});
