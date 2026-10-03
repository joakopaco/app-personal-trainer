export type NumericField='weight'|'sets'|'reps'|'durationSec'|'microRest'|'macroRest';
export const limits:Record<NumericField,readonly[number,number]>={weight:[0,1000],sets:[1,50],reps:[1,500],durationSec:[1,86400],microRest:[0,3600],macroRest:[0,3600]};
export function parseNumber(field:NumericField,raw:string):{ok:true;value:number|null}|{ok:false}{
  if(raw===''&&(field==='microRest'||field==='macroRest'))return {ok:true,value:null};
  const normalized=raw.replace(',','.');
  if(!(field==='weight'?/^(0|[1-9]\d*)(\.\d{1,2})?$/:/^(0|[1-9]\d*)$/).test(normalized))return {ok:false};
  const value=Number(normalized);const[min,max]=limits[field];
  return Number.isFinite(value)&&value>=min&&value<=max?{ok:true,value}:{ok:false};
}
