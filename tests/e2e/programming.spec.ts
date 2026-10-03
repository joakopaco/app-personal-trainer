import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {command,execute,createStudent,dropFixture} from '../fixtures/cloud';
import {routineFixture} from '../fixtures/routine';
test('publishes immutable monthly routine, rejects stale writes and records absence without reschedule',async()=>{
 const a=await createStudent();try{
 const draftId=randomUUID(),doc=routineFixture();
 const save=await execute(a.client,command(a.workspaceId,a.studentId,'save_draft',{draftId,expectedDraftRevision:0,baseRoutineRevisionId:null,document:doc},a.revision));expect(save.status).toBe('applied');
 const month=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit'}).format(new Date());
 const publish=await execute(a.client,command(a.workspaceId,a.studentId,'publish_routine',{draftId,expectedDraftRevision:1,baseRoutineRevisionId:null,targetMonth:month},save.revision));expect(publish.status).toBe('applied');expect(publish.patch.routine.document.name).toBe('Nueva rutina');
 const visitId=randomUUID();const visit=await execute(a.client,command(a.workspaceId,a.studentId,'create_visit',{visitId,date:month+'-15',time:'18:00'},publish.revision));expect(visit.status).toBe('applied');
 const absent=await execute(a.client,command(a.workspaceId,a.studentId,'mark_absent',{visitId},visit.revision));expect(absent.status).toBe('applied');expect(absent.patch.visits.find((v:{id:string})=>v.id===visitId).status).toBe('absent');expect(absent.patch.visits).toHaveLength(1);
 const stale=await execute(a.client,command(a.workspaceId,a.studentId,'publish_routine',{draftId,expectedDraftRevision:1,baseRoutineRevisionId:null,targetMonth:month},save.revision));expect(stale.status).toBe('conflict');
 const immutable=await a.client.from('routine_revisions').update({document:{}}).eq('id',publish.patch.routine.id);expect(immutable.error).not.toBeNull();
 }finally{await dropFixture(a.studentId);}
});
