import {expect,test} from 'vitest';
import {parseNumber} from '@pulso/domain/numbers';
import {blankRoutine,cloneRoutineDocument,validateRoutine} from '@pulso/domain/routines';
import {volume} from '@pulso/domain/metrics';
test.each([['22,5',22.5],['0',0],['1000',1000]])('weight %s preserves its numeric value',(raw,want)=>expect(parseNumber('weight',raw)).toEqual({ok:true,value:want}));
test.each(['','-1','1e2','NaN','1001','2.555','1,2.3'])('invalid weight %s cannot become a confirmed value',raw=>expect(parseNumber('weight',raw)).toEqual({ok:false}));
test('zero and missing rest are distinct',()=>{expect(parseNumber('microRest','')).toEqual({ok:true,value:null});expect(parseNumber('microRest','0')).toEqual({ok:true,value:0});});
test('copies receive independent day block and position identities',()=>{const source=blankRoutine();const clone=cloneRoutineDocument(source);expect(clone.weeks[0][0].id).not.toBe(source.weeks[0][0].id);clone.name='Otro';expect(source.name).toBe('Nueva rutina');});
test('empty and incomplete routines cannot publish',()=>expect(validateRoutine(blankRoutine(),true).length).toBeGreaterThan(0));
test('confirmed working sets produce 400 kg rep, then correction produces 380',()=>{
 const rows=[{weight:20,reps:10,type:'load_reps',state:'done',warmup:false},{weight:25,reps:8,type:'load_reps',state:'done',warmup:false},{weight:10,reps:10,type:'load_reps',state:'done',warmup:true},{weight:100,reps:10,type:'load_reps',state:'skipped',warmup:false},{weight:null,reps:null,type:'time',state:'done',warmup:false}];
 expect(volume(rows)).toBe(400);rows[1].weight=22.5;expect(volume(rows)).toBe(380);
});
