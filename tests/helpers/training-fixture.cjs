exports.fixture=()=>{
  const e={id:'e1',name:'Remo',group:'Espalda',weight:20,sets:3,reps:8,microRest:null};
  const block={id:'b1',name:'Principal',type:'main',macroRest:null,macroTarget:'series',exercises:[e]};
  const day={id:'d1',title:'Espalda',weekday:'Lun',blocks:[block]};
  const routine={id:'r1',name:'Septiembre',date:'2026-09-01',period:'2026-09',revision:1,weeks:Array.from({length:4},()=>[structuredClone(day)])};
  return {version:6,revision:0,operationIds:[],db:{people:[{id:'p1',name:'Juan Pérez',initials:'JP',weekdays:['Lun'],scheduleTimes:{Lun:'10:00'},routine,archives:[],records:[],history:[]}],templates:[],library:[],branding:{},visits:[],sessions:[]}};
};
