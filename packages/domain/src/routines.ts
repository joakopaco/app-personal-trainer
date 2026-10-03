import {z} from 'zod';
const rest=z.number().int().min(0).max(3600).nullable();
export const prescriptionSchema=z.object({weight:z.number().min(0).max(1000).multipleOf(.01).nullable(),sets:z.number().int().min(1).max(50).nullable(),reps:z.number().int().min(1).max(500).nullable(),durationSec:z.number().int().min(1).max(86400).nullable(),microRest:rest});
export const exerciseTypeSchema=z.enum(['load_reps','reps','time']);
export const positionSchema=z.object({id:z.uuid(),lineageId:z.uuid(),exerciseId:z.string().min(1).max(100),name:z.string().trim().min(1).max(120),group:z.string().min(1).max(80),type:exerciseTypeSchema,warmup:z.boolean(),prescription:prescriptionSchema});
export const blockSchema=z.object({id:z.uuid(),name:z.string().min(1).max(80),type:z.enum(['mobility','approximation','main']),macroRest:rest,macroTarget:z.enum(['series','blocks']),exercises:z.array(positionSchema).max(50)});
export const daySchema=z.object({id:z.uuid(),name:z.string().min(1).max(80),blocks:z.array(blockSchema).max(30)});
export const routineSchema=z.object({schemaVersion:z.literal(1),name:z.string().trim().min(1).max(120),weeks:z.array(z.array(daySchema).min(1).max(14)).length(4)});
export type Prescription=z.infer<typeof prescriptionSchema>;
export type Position=z.infer<typeof positionSchema>;
export type Block=z.infer<typeof blockSchema>;
export type RoutineDay=z.infer<typeof daySchema>;
export type RoutineDocument=z.infer<typeof routineSchema>;
export function blankRoutine():RoutineDocument{return {schemaVersion:1,name:'Nueva rutina',weeks:Array.from({length:4},()=>[{id:crypto.randomUUID(),name:'Día 1',blocks:[]}])};}
export function cloneRoutineDocument(doc:RoutineDocument,idFactory:()=>string=()=>crypto.randomUUID()):RoutineDocument{
  const copy=structuredClone(doc);const lineages=new Map<string,string>();
  for(const week of copy.weeks)for(const day of week){day.id=idFactory();for(const b of day.blocks){b.id=idFactory();for(const p of b.exercises){p.id=idFactory();if(!lineages.has(p.lineageId))lineages.set(p.lineageId,idFactory());p.lineageId=lineages.get(p.lineageId)!;}}}
  return copy;
}
export function validateRoutine(doc:unknown,publish=false):string[]{
 const result=routineSchema.safeParse(doc);if(!result.success)return result.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`);
 const errors:string[]=[];const ids=new Set<string>();
 for(const week of result.data.weeks)for(const day of week){const exerciseLineages=new Set<string>();
   const positions=day.blocks.flatMap(b=>b.exercises);
   for(const item of [day,...day.blocks,...positions]){if(ids.has(item.id))errors.push('Identidad repetida');ids.add(item.id);}
   if(publish&&!positions.length)errors.push(`${day.name}: agregá ejercicios`);
   for(const p of positions){if(exerciseLineages.has(p.lineageId))errors.push('Posición repetida en el día');exerciseLineages.add(p.lineageId);
     if(publish&&(p.prescription.sets===null||(p.type!=='time'&&p.prescription.reps===null)||(p.type==='load_reps'&&p.prescription.weight===null)||(p.type==='time'&&p.prescription.durationSec===null)))errors.push(`${p.name}: completá los valores`);
   }
 }
 return errors;
}
