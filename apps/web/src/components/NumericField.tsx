import {useState,useEffect,useRef} from 'react';
import {parseNumber,type NumericField as FieldName} from '@pulso/domain/numbers';
export function NumericField({label,field,value,onChange,onRaw,rawValue}:{label:string;field:FieldName;value:number|null;onChange:(value:number|null)=>void;onRaw?:(raw:string)=>void;rawValue?:string}){
 const[raw,setRaw]=useState(rawValue??(value===null?'':String(value)));const focused=useRef(false);
 useEffect(()=>{if(!focused.current)setRaw(rawValue??(value===null?'':String(value)));},[value,rawValue]);
 const result=parseNumber(field,raw);return <label className="field">{label}<input inputMode={field==='weight'?'decimal':'numeric'} value={raw} aria-invalid={raw!==''&&!result.ok} onFocus={e=>{focused.current=true;e.target.select();}} onChange={e=>{const v=e.target.value;setRaw(v);onRaw?.(v);const parsed=parseNumber(field,v);if(parsed.ok)onChange(parsed.value);}} onBlur={()=>{focused.current=false;}}/><span className="field-hint">{raw!==''&&!result.ok?'Revisá el valor':''}</span></label>;
}
