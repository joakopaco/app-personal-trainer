const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
function session(saved){
  const storage=new Map(saved?[['pulso-demo-v5',saved]]:[]);
  const context={structuredClone,console,failStorage:false,document:{addEventListener(){}},sessionStorage:{getItem:()=>null},localStorage:{getItem:key=>storage.get(key)||null,setItem(key,value){if(context.failStorage)throw Error('Storage full');storage.set(key,value)}}};
  context.window=context;vm.createContext(context);
  vm.runInContext(['data.js','model.js','ui-core.js','views.js','anatomy.js','calendar.js','experience.js','history.js'].map(read).join('\n'),context);
  const app=read('app.js');vm.runInContext(app.slice(0,app.indexOf("document.addEventListener('click'")),context);
  vm.runInContext("let lastModal,lastToast;modal=(...args)=>{lastModal=args};render=()=>{};closeModal=()=>{};go=()=>{};toast=text=>{lastToast=text};error=text=>{lastToast=text};",context);
  return {run:code=>vm.runInContext(code,context),saved:()=>storage.get('pulso-demo-v5'),context};
}
test('new draft remains unsaved through unrelated actions and reload',()=>{
  const s=session();s.run("assignRoutine(person().routine);mutateDays(d=>d.main[0].weight=99);action('close');");
  assert.equal(s.run('draftHasChanges(person())'),true);
  assert.equal(session(s.saved()).run('Boolean(person().draft)'),false);
  assert.match(s.run('editorScreen()'),/Guardar borrador/);
  assert.match(s.run('editorScreen()'),/Cambios sin guardar/);
});
test('manual save persists; further exercise and day edits do not leak into storage',()=>{
  const s=session();s.run("assignRoutine(person().routine);mutateDays(d=>d.main[0].weight=41);action('save-draft');");
  assert.equal(s.run('draftHasChanges(person())'),false);
  assert.equal(session(s.saved()).run('person().draft.weeks[0][0].main[0].weight'),41);
  s.run("mutateDays(d=>d.main[0].weight=72);person().draft.weeks.forEach(w=>w.push(copy(w[0])));person().draft.revision++;DB.people[1].scheduleTimes.Lun='12:15';action('close');");
  const reloaded=session(s.saved());
  assert.equal(reloaded.run('person().draft.weeks[0][0].main[0].weight'),41);
  assert.equal(reloaded.run('person().draft.weeks[0].length'),3);
  assert.equal(reloaded.run('DB.people[1].scheduleTimes.Lun'),'12:15');
  s.run("action('save-draft')");
  assert.equal(session(s.saved()).run('person().draft.weeks[0][0].main[0].weight'),72);
  assert.equal(session(s.saved()).run('person().draft.weeks[0].length'),4);
});
test('saving one student never saves another pending draft',()=>{
  const s=session();s.run("assignRoutine(person().routine);state.person=1;assignRoutine(person().routine);action('save-draft');");
  const reloaded=session(s.saved());
  assert.equal(reloaded.run('Boolean(DB.people[0].draft)'),false);
  assert.equal(reloaded.run('Boolean(DB.people[1].draft)'),true);
});
test('failed manual save retains pending edits and the last saved version',()=>{
  const s=session();s.run("assignRoutine(person().routine);action('save-draft');");
  const before=s.saved();s.run('mutateDays(d=>d.main[0].weight=88)');
  s.context.failStorage=true;s.run("action('save-draft')");
  assert.equal(s.saved(),before);
  assert.equal(s.run('person().draft.weeks[0][0].main[0].weight'),88);
  assert.equal(s.run('draftHasChanges(person())'),true);
  assert.match(s.run('editorScreen()'),/No se pudo guardar/);
  s.context.failStorage=false;s.run("action('close')");
  assert.notEqual(session(s.saved()).run('person().draft.weeks[0][0].main[0].weight'),88);
  s.run("action('save-draft')");
  assert.equal(session(s.saved()).run('person().draft.weeks[0][0].main[0].weight'),88);
});
test('activation requires saved changes and removes the saved draft after activation',()=>{
  const s=session();const active=s.run('person().routine.id');
  s.run("assignRoutine(person().routine);action('activate-draft')");
  assert.equal(s.run('lastModal[0]'),'Guardá el borrador primero');
  assert.equal(s.run('person().routine.id'),active);
  s.run("action('save-draft');action('activate-draft')");
  assert.equal(s.run('lastModal[0]'),'Activar esta rutina');
  s.run("action('confirm-activate')");
  const reloaded=session(s.saved());
  assert.equal(reloaded.run('Boolean(person().draft)'),false);
  assert.notEqual(reloaded.run('person().routine.id'),active);
  assert.equal(reloaded.run('person().archives[0].id'),active);
});
test('discard removes both saved and working draft without altering active routine',()=>{
  const s=session();const active=s.run('JSON.stringify(person().routine)');
  s.run("assignRoutine(person().routine);action('save-draft');mutateDays(d=>d.main[0].weight=100);action('confirm-discard')");
  assert.equal(s.run('Boolean(person().draft)'),false);
  const reloaded=session(s.saved());
  assert.equal(reloaded.run('Boolean(person().draft)'),false);
  assert.equal(reloaded.run('JSON.stringify(person().routine)'),active);
});
test('templates are always empty and newly added exercises have no prescription',()=>{
  const s=session();
  s.run("const template=emptyTemplate('Nueva',2);DB.templates.push(template);state.templateId=template.id;state.week=1;state.day=0;");
  assert.equal(s.run("activeRoutine().weeks.every(w=>w.length===2&&w.every(d=>!d.main.length&&!d.mobility.length&&!d.approximation.length))"),true);
  s.run("addExercise(DB.library[0].id,'main')");
  assert.equal(s.run("activeRoutine().weeks.every(w=>w[0].main.length===1&&['weight','sets','reps'].every(k=>w[0].main[0][k]===null))"),true);
  assert.match(s.run('valueControls(currentDay().main[0])'),/value="" selected/);
  assert.doesNotMatch(s.run("zoneView('main',currentDay().main)"),/>null</);
  assert.doesNotMatch(s.run('bankScreen()'),/Usar en alumno/);
});
test('draft cannot preview a document or activate an incomplete exercise',()=>{
  const s=session();s.run("assignRoutine(person().routine);addExercise(DB.library[0].id,'main');action('save-draft');action('activate-draft')");
  assert.equal(s.run('lastModal[0]'),'Completá el borrador');
  assert.doesNotMatch(s.run('editorScreen()'),/Ver documento/);
});
test('routine weight changes appear only after manual save and survive reload',()=>{
  const s=session();s.run("assignRoutine(person().routine);action('save-draft');const eventsBefore=person().history.length;mutateDays(d=>d.main[0].weight=65);");
  assert.equal(s.run('person().history.length===eventsBefore'),true);
  s.run("action('save-draft')");
  assert.match(s.run('JSON.stringify(person().history.at(-1).details)'),/peso: 40 kg → 65 kg/);
  assert.match(session(s.saved()).run('JSON.stringify(person().history.at(-1).details)'),/65 kg/);
  s.run("action('save-draft')");
  assert.equal(s.run('person().history.length===eventsBefore+1'),true);
});
test('session corrections preserve old values while progress uses the corrected record',()=>{
  const s=session();s.run("const record={date:TODAY,name:'Prueba de carga',group:'Espalda',weight:20,sets:3,reps:8,exerciseId:'test',routineId:person().routine.id,zone:'main',source:'session'};saveSession(person(),[record]);saveSession(person(),[{...record,weight:25}]);");
  assert.equal(s.run("person().records.filter(r=>r.exerciseId==='test').length"),1);
  assert.equal(s.run('person().history.at(-1).corrections[0].before.weight'),20);
  assert.equal(s.run('person().history.at(-1).corrections[0].after.weight'),25);
  assert.equal(s.run("progressData().find(e=>e.name==='Prueba de carga').last"),25);
  const reloaded=session(s.saved());
  assert.match(reloaded.run('historyScreen()'),/Registro de entrenamiento corregido/);
  assert.equal(reloaded.run('person().history.at(-1).corrections[0].before.weight'),20);
});
test('session validation and storage failure preserve prior records and audit',()=>{
  const s=session();const before=s.run('JSON.stringify(person().records)');
  s.run("const record={date:TODAY,name:'Prueba',group:'Espalda',weight:null,sets:3,reps:8,exerciseId:'test',routineId:person().routine.id,zone:'main',source:'session'};");
  assert.equal(s.run('saveSession(person(),[record])'),false);
  s.context.failStorage=true;
  assert.equal(s.run('saveSession(person(),[{...record,weight:20}])'),false);
  assert.equal(s.run('JSON.stringify(person().records)'),before);
  assert.equal(s.run('person().history.length'),0);
});
test('existing archives and records are visible without inventing past audit events',()=>{
  const s=session();
  assert.equal(s.run("historyEntries(person()).filter(e=>e.kind==='routine').length"),3);
  assert.ok(s.run("historyEntries(person()).filter(e=>e.kind==='sessions').length")>0);
  assert.equal(s.run('person().history.length'),0);
  assert.match(s.run('exerciseBank()'),/Banco de ejercicios/);
  assert.match(s.run('exerciseBank()'),/Agregar ejercicio/);
});
test('catalog creation persists metadata and rejects duplicate exercise names',()=>{
  const s=session();s.run("const fields={'#exercise-name':{value:'Ejercicio de prueba'},'#exercise-group':{value:'Espalda'},'#exercise-notes':{value:'Descripción'}};document.querySelector=selector=>fields[selector];action('save-new-exercise');");
  assert.equal(s.run("DB.library.filter(e=>e.name==='Ejercicio de prueba').length"),1);
  assert.equal(s.run("DB.library.at(-1).weight"),undefined);
  assert.equal(session(s.saved()).run("DB.library.at(-1).name"),'Ejercicio de prueba');
  s.run("action('save-new-exercise')");
  assert.equal(s.run("DB.library.filter(e=>e.name==='Ejercicio de prueba').length"),1);
});
test('new template action ignores copying and opens a genuinely blank routine',()=>{
  const s=session();s.run("action('new-template')");
  assert.doesNotMatch(s.run('lastModal[2]'),/template-source|Copiar desde/);
  s.run("const fields={'#template-name':{value:'Desde cero'},'#template-days':{value:'3'},'#template-source':{value:'student:0'}};document.querySelector=selector=>fields[selector];action('save-empty-template');");
  assert.equal(s.run('activeRoutine().name'),'Desde cero');
  assert.equal(s.run("activeRoutine().weeks.every(w=>w.length===3&&w.every(d=>!d.main.length&&!d.mobility.length&&!d.approximation.length))"),true);
  assert.equal(session(s.saved()).run('DB.templates.at(-1).name'),'Desde cero');
});


test('progress document has no interactive selection and is independent of selected muscle',()=>{
  const s=session();
  const before=s.run("state.group='Hombros';bodyMap(progressData(),false)");
  const after=s.run("state.group='Pecho';bodyMap(progressData(),false)");
  assert.equal(before,after);
  assert.doesNotMatch(before,/selected|data-body-group|tabindex|role="button"/);
});

test('both anatomical figures include every supported muscle group',()=>{
  const s=session();
  for(const gender of ['masculino','femenino']){
    s.run(`person().gender='${gender}'`);
    const groups=JSON.parse(s.run('JSON.stringify(MUSCLE_GROUPS)'));
    const map=s.run('bodyMap(progressData())');
    for(const group of groups)assert.ok(map.includes(`data-body-group="${group}"`),`${gender}: ${group}`);
  }
});

test('muscles without records remain selected and show an honest empty state',()=>{
  const s=session();
  s.run("state.group='Antebrazos'");
  assert.equal(s.run('metricSelection(progressData()).selected'),undefined);
  assert.equal(s.run('state.group'),'Antebrazos');
  assert.match(s.run('progressScreen()'),/Sin datos en este período/);
  assert.match(s.run('bodyMap(progressData())'),/class="muscle-region selected"[^>]+fill="#dce4df"/);
});

test('muscle aliases connect recorded metrics to the same anatomical region',()=>{
  const s=session();
  s.run("const aliasData=[{...progressData()[0],group:'Gemelos'}];state.group='Pantorrillas';state.bodyMode='load'");
  assert.equal(s.run('groupMetrics(aliasData)[0].group'),'Pantorrillas');
  assert.equal(s.run('metricSelection(aliasData).group.length'),1);
  assert.match(s.run('bodyMap(aliasData)'),/fill="#214f43"[^>]+data-body-group="Pantorrillas"/);
});
