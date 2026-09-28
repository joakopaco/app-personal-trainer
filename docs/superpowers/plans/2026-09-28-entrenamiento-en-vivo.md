# Seguimiento en vivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir seguir varios entrenamientos abiertos, guardar ajustes durante la sesión con historial y recuperar los datos confirmados sin mezclar alumnos ni sesiones.

**Architecture:** Mantener la app sin framework y extraer módulos pequeños para esquema, almacenamiento transaccional y operaciones de entrenamiento. IndexedDB almacena una instantánea versionada mediante transacciones con control de revisión; las entradas pendientes de la interfaz permanecen separadas. Las rutinas usan bloques variables, y las sesiones guardan su propia copia e identidad.

**Tech Stack:** HTML, CSS, JavaScript clásico en navegador; IndexedDB; Node.js 24 y `node:test` para lógica; navegador real para persistencia, concurrencia, recarga y accesibilidad. No añadir dependencias de producción ni backend en esta revisión.

**Spec:** `docs/superpowers/specs/2026-09-28-entrenamiento-en-vivo-design.md`, aprobada por el usuario.

## Global Constraints

- «No puede haber dos sesiones abiertas del mismo alumno, pero sí sesiones sucesivas en un mismo día.»
- «No modifica otros alumnos, plantillas, semanas anteriores ni sesiones históricas.»
- «Se mantienen los límites actuales de peso, series y repeticiones en esta revisión: 0–150 kg, 1–4 series y 1–15 repeticiones, todos enteros.»
- «Ambos admiten enteros de 0 a 3600; vacío significa sin definir y cero significa sin descanso.»
- «Los cambios válidos se encolan al escribir con una espera breve de 300 ms, o inmediatamente al salir del campo, pulsar Enter o cambiar de alumno.»
- «Solo la confirmación de la transacción permite mostrar éxito.»
- «La edición estructural de una rutina sigue usando borrador, guardado manual y activación.»
- «Los datos ficticios existentes conservan sus fechas originales; ningún cambio de fecha fabrica asistencias pasadas.»
- «Conserva intacta la clave anterior como recuperación.»
- «No se anuncia sincronización entre dispositivos.»

## Review Focus

1. Ejercicio repetido en dos bloques: actualizar solo la posición seleccionada y sus equivalentes entre semanas. Prueba en tarea 3.
2. Campo transitoriamente vacío, entrada inválida o cierre durante el debounce: no convertir vacío en cero ni cerrar con datos pendientes. Pruebas en tareas 1 y 6.
3. Sesión que cruza medianoche o cambio de mes: conservar período original y renovar una sola vez después del cierre. Prueba en tarea 4.
4. Segunda pestaña con una revisión vieja: no borrar escrituras confirmadas, conservar el pendiente para resolución explícita. Pruebas en tareas 2 y 9.
5. Borrador guardado antes de subir una carga en vivo: no activar valores antiguos sin resolver diferencias. Pruebas en tareas 5 y 9.

## Estado inicial y mapa de archivos

Base comprobada: `node --test tests/manual-draft.test.cjs` pasa 18/18 en Node v24.19.0. Son pruebas de la versión anterior, no evidencia del nuevo guardado. No hay framework, build ni package.json. `app.js` registra eventos y arranca la app al final del archivo. `experience.js` reemplaza vistas y controla borradores; hay que revisar tanto sus renderizadores como los de `views.js`.

Crear:

- `training-schema.js`: versión, validación, migración, bloques y reloj local.
- `training-storage.js`: repositorio IndexedDB, revisión y errores de persistencia.
- `training-domain.js`: comandos puros de visitas, sesiones, ajustes y cierre.
- `training-months.js`: renovación mensual y comparación de borradores con la rutina vigente.
- `training-controller.js`: cola de escrituras, edición pendiente y coordinación con la UI.
- `training-views.js`, `training.css`: agenda y seguimiento durante la sesión.
- `training-backup.js`: exportación y restauración validada de datos confirmados.
- `tests/helpers/training-fixture.cjs`, `tests/helpers/load-training.cjs`: fixture mínimo y cargador VM.
- `tests/training-schema.test.cjs`, `tests/training-storage.test.cjs`, `tests/training-domain.test.cjs`, `tests/training-months.test.cjs`, `tests/training-controller.test.cjs`, `tests/training-backup.test.cjs`.
- `tests/browser/training-checks.html`, `tests/browser/training-checks.js`: pruebas de IndexedDB real en una base de datos aislada; nunca limpiar la base del usuario.

Modificar los puntos existentes, sin reestructurar áreas ajenas:

- `model.js`: inicialización, `persist`, consultas y creadores de rutinas; conservar borradores manuales.
- `app.js`: `action`, acciones que escriben datos, eventos de edición/arrastre y arranque asíncrono.
- `experience.js`: `lifecycleAction`, `editorScreen`, activación y vistas de documentos.
- `views.js`, `ui-core.js`: recuentos de ejercicios, campos, documentos y bloques variables.
- `calendar.js`: visitas por fecha e identidades en lugar de un estado global por alumno.
- `history.js`: eventos de cambios y resultados agrupados por sesión.
- `index.html`: orden de scripts, pantalla de carga y hoja de estilo nueva.
- `tests/manual-draft.test.cjs`: adaptar arranque asíncrono conservando los 18 comportamientos que siguen vigentes; sustituir las expectativas del flujo antiguo de confirmación por las de cierre de sesión.
- `README.md`, `docs/verification.md`: funcionamiento, pruebas ejecutadas y límites reales.

## Contratos comunes

Los módulos exponen objetos `globalThis.TrainingSchema`, `TrainingStorage`, `TrainingDomain`, `TrainingMonths`, `TrainingController` y `TrainingBackup`; no convertir la app entera a módulos ES. El cargador VM obtiene esos mismos objetos para las pruebas. Los nombres de contrato siguientes se mantienen durante todas las tareas.

```js
// Instantánea persistida. `db` conserva las entidades actuales y añade visitas/sesiones.
// {version:6, revision:0, operationIds:[], db:{people,templates,library,branding,visits:[],sessions:[]}}
// Routine: campos actuales + period:'YYYY-MM'; day: {id,title,weekday,blocks:[]}
// Block: {id,name,type:'mobility'|'approximation'|'main',macroRest:null,macroTarget:'series'|'blocks',exercises:[]}
// Exercise: campos actuales + microRest:null. Su id identifica la posición, no el catálogo.
// Visit: {id,personId,date,time,status,source:'schedule'|'walkin',rescheduledFrom:null,rescheduledTo:null}
// Session: {id,visitId,personId,routineId,period,dayId,week,startedAt,endedAt:null,status:'open',blocks:[]}
// Ejercicio de sesión: copia del ejercicio + skipped:false.
// Evento: {id,operationId,date,recordedAt,type,title,details,sessionId,blockId,exerciseId,field,before,after}.
// Resultados nuevos: campos actuales + sessionId,blockId,startedAt,recordedAt,microRest,macroRest,macroTarget.
```

Contexto de operaciones: `{id:()=>string, now:()=>Date}`. El reloj no usa `toISOString().slice(0,10)` para la fecha local. `week` usa base 1 (1–4). Los identificadores de día, bloque y posición se conservan entre semanas de una misma rutina; copiar a otra rutina conserva la correspondencia interna y asigna una identidad de rutina nueva. Toda operación valida pertenencia antes de modificar.

Cada archivo nuevo de pruebas Node empieza con este encabezado; los ejemplos de tests de las tareas se agregan después:

```js
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers/load-training.cjs');
const {fixture}=require('./helpers/training-fixture.cjs');
```

### Task 1: Esquema, migración y fixture verificable

**Files:** crear `training-schema.js`, ambos helpers y `tests/training-schema.test.cjs`; leer `model.js` y `data.js` como fuente de compatibilidad. No cambiar todavía el arranque productivo.

**Interfaces:** `TrainingSchema.migrateV5(saved)` devuelve envelope v6 sin mutar `saved`; `validate(envelope)` devuelve el mismo envelope o lanza error descriptivo; `parseField(field,raw)` devuelve `{ok,value}`; `dateKey(date)` devuelve fecha local; `defaultWeek(date)` devuelve 1–4. `load(files)` devuelve un contexto VM con los objetos de esos archivos. `fixture()` devuelve datos nuevos en cada llamada.

- [ ] Crear un fixture mínimo completo y pruebas antes de implementar:

```js
// tests/helpers/training-fixture.cjs
exports.fixture = () => {
  const exercise={id:'e1',name:'Remo',group:'Espalda',weight:20,sets:3,reps:8,microRest:null};
  const block={id:'b1',name:'Principal',type:'main',macroRest:null,macroTarget:'series',exercises:[exercise]};
  const day={id:'d1',title:'Espalda',weekday:'Lun',blocks:[block]};
  const routine={id:'r1',name:'Septiembre',date:'2026-09-01',period:'2026-09',revision:1,weeks:Array.from({length:4},()=>[structuredClone(day)])};
  const person={id:'p1',name:'Juan Pérez',initials:'JP',weekdays:['Lun'],scheduleTimes:{Lun:'10:00'},routine,archives:[],records:[],history:[]};
  return {version:6,revision:0,operationIds:[],db:{people:[person],templates:[],library:[],branding:{},visits:[],sessions:[]}};
};
// tests/helpers/load-training.cjs
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
exports.load=(files,extra={})=>{
  const context=vm.createContext({structuredClone,console,Date,JSON,Math,setTimeout,clearTimeout,...extra});
  for(const file of files)vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8'),context,{filename:file});
  return context;
};
```

```js
test('vacío no se convierte en cero y la semana 5 usa la variante 4',()=>{
  const {TrainingSchema:S}=load(['training-schema.js']);
  assert.equal(S.parseField('weight','').ok,false);
  assert.equal(S.parseField('weight','0').value,0);
  assert.equal(S.parseField('microRest','').value,null);
  assert.equal(S.parseField('reps','1e2').ok,false);
  assert.equal(S.defaultWeek(new Date(2026,8,30)),4);
});
```

- [ ] Ejecutar `node --test tests/training-schema.test.cjs`; comprobar fallo por módulo/función ausente.
- [ ] Implementar `parseField` con expresiones de enteros decimales y límites del diseño. No aplicar `Number('')`. Usar `Math.min(4,Math.floor((date.getDate()-1)/7)+1)` para semana y componentes locales para fecha. La validación recorre tipos, arrays, fechas, estados, números finitos y referencias; acepta campos desconocidos preservados de v5, no referencias rotas de entidades nuevas.
- [ ] Implementar migración mediante `structuredClone(saved.db)`: convertir las tres zonas a bloques, preservando ids de ejercicios; generar ids de bloque estables dentro de cada día y rutina; asignar mes desde `routine.date`; mantener historial y registros sin inventar horas. Convertir solo la visita explícita existente de cada alumno, sin materializar meses de agenda pasada. Conservar branding y borradores guardados. Los registros antiguos siguen identificados como anteriores, sin fabricar sesiones.
- [ ] Añadir pruebas que comparen contenido antes/después de la migración, entradas nulas, rutinas incompletas de borrador, fechas inválidas y referencias ajenas. Verificar que ejecutar la migración dos veces no duplica bloques y que `validate` rechaza una versión futura.
- [ ] Ejecutar la suite de esquema y registrar el resultado. Commit con archivos explícitos: `test/schema: preserve legacy training data in v6 migration`.

### Task 2: Repositorio IndexedDB y confirmación real de escritura

**Files:** crear `training-storage.js`, `tests/training-storage.test.cjs` y página de pruebas de navegador.

**Interfaces:** `TrainingStorage.open({name='pulso-v6',indexedDB=globalThis.indexedDB})` → repositorio; `repo.load()` → envelope o null; `repo.transact({expectedRevision,operationId},reduce)` → envelope confirmado; `repo.initialize(envelope)` → inserta solo si falta; `repo.close()`. `reduce(current)` es síncrono y devuelve el candidato. Errores con `code`: `CONFLICT`, `UNAVAILABLE`, `INVALID`, `WRITE_FAILED`. No hay fallback silencioso a datos ficticios.

- [ ] Escribir la prueba de navegador con dos conexiones al mismo nombre único. La página usa `crypto.randomUUID()` en el nombre y borra solamente esa base al finalizar.

```js
async function checkStorage(seed) {
  const name='pulso-test-'+crypto.randomUUID();
  const a=await TrainingStorage.open({name}),b=await TrainingStorage.open({name});
  try {
    await a.initialize(seed);
    const first=await a.transact({expectedRevision:0,operationId:'op1'},current=>{
      current.db.people[0].name='Guardado';return current;
    });
    if(first.revision!==1)throw Error('Revisión incorrecta');
    let conflict=false;
    try{await b.transact({expectedRevision:0,operationId:'op2'},current=>current)}
    catch(error){conflict=error.code==='CONFLICT'}
    if(!conflict)throw Error('Se perdió el control de concurrencia');
    if((await b.load()).db.people[0].name!=='Guardado')throw Error('Dato perdido');
  } finally {a.close();b.close();indexedDB.deleteDatabase(name)}
}
```

- [ ] Ejecutar la página servida localmente y registrar el fallo inicial. Usar la habilidad de navegador correspondiente cuando se controle el navegador; no simular IndexedDB con localStorage.
- [ ] Implementar un object store `state` con clave `current`. Abrir transacción `readwrite`, leer la instantánea, verificar primero operación ya aplicada y después revisión, reducir y validar una copia, incrementar revisión y añadir operationId, y hacer `put`. Resolver únicamente en `transaction.oncomplete`; rechazar en `onabort/onerror`. No insertar ningún `await` entre el `get.onsuccess` y el `put`.

```js
// Núcleo dentro de get.onsuccess, con current ya leído:
if(current.operationIds.includes(operationId)){committed=current;return}
if(current.revision!==expectedRevision){failure=Object.assign(new Error('Datos actualizados en otra pestaña'),{code:'CONFLICT'});tx.abort();return}
committed=TrainingSchema.validate(reduce(structuredClone(current)));
committed.revision=current.revision+1;
committed.operationIds=[...current.operationIds,operationId];
store.put(committed,'current');
// tx.oncomplete resuelve `committed`; un éxito de request no confirma el commit.
```

- [ ] Probar reintento con mismo operationId, aborto antes de commit, escritura inválida, inicialización simultánea y bloqueo de apertura. Para pruebas Node del adaptador, inyectar requests/transacciones controlables que distingan `request.onsuccess` de `tx.oncomplete`; mantener la prueba real de navegador como evidencia obligatoria.
- [ ] Ejecutar las pruebas de almacenamiento y esquema. Commit: `feat/storage: add transactional local training repository`.

### Task 3: Visitas y sesiones con identidad, ajustes y cierre

**Files:** crear `training-domain.js`, `tests/training-domain.test.cjs`; aún sin conectar handlers antiguos.

**Interfaces:** `TrainingDomain.apply(envelope,command,context)` devuelve una copia; nunca escribe en disco. Comandos: `start`, `edit`, `skip`, `finish`, `absent`, `reschedule`, `correct`. Todos llevan `operationId`. `start` recibe `personId,visitId?,sessionId,dayId,week,date,time`; `edit` recibe `sessionId,blockId,exerciseId?,field,value`; macro usa blockId sin exerciseId; `skip` recibe sessionId/blockId/exerciseId/value booleano. `finish` recibe sessionId. `absent` recibe visitId. `reschedule` recibe visitId/date/time/newVisitId. `correct` recibe sessionId/blockId/exerciseId/field/value y solo opera sobre sesiones cerradas.

- [ ] Añadir la prueba mínima que fija aislamiento y resultados:

```js
test('ajustar y cerrar conserva auditoría sin duplicar resultados',()=>{
  const {TrainingDomain:D}=load(['training-schema.js','training-domain.js']);
  let serial=0;const ctx={id:()=>`test-${++serial}`,now:()=>new Date('2026-09-28T13:00:00Z')};
  let s=D.apply(fixture(),{type:'start',operationId:'start',personId:'p1',sessionId:'s1',dayId:'d1',week:2,date:'2026-09-28',time:'10:00'},ctx);
  s=D.apply(s,{type:'edit',operationId:'edit',sessionId:'s1',blockId:'b1',exerciseId:'e1',field:'weight',value:22},ctx);
  assert.equal(s.db.people[0].routine.weeks[0][0].blocks[0].exercises[0].weight,20);
  assert.equal(s.db.people[0].routine.weeks[1][0].blocks[0].exercises[0].weight,22);
  assert.equal(s.db.people[0].records.length,0);
  s=D.apply(s,{type:'finish',operationId:'finish',sessionId:'s1'},ctx);
  s=D.apply(s,{type:'finish',operationId:'finish-again',sessionId:'s1'},ctx);
  assert.equal(s.db.people[0].records.length,1);
  assert.equal(s.db.people[0].records[0].sessionId,'s1');
});
```

- [ ] Ejecutar `node --test tests/training-domain.test.cjs`; comprobar fallo inicial.
- [ ] Implementar `start`: buscar alumno, rutina/día/semana, comprobar sesión abierta existente, validar visita si fue suministrada o crear walkin, copiar bloques y agregar skipped=false. Doble inicio sobre el mismo alumno devuelve el estado con la sesión existente, no crea otra.
- [ ] Implementar `edit`: validar campo con `parseField`, buscar sesión abierta y posición, capturar before/after, propagar por ids a semana actual y siguientes del día y rutina referidos, incrementar revisión de rutina y añadir evento con operationId. Si no cambia el valor, no crear evento.
- [ ] Implementar `finish`: validar todos los ejercicios no omitidos, añadir resultados con sessionId y posición, poner endedAt/status y visita finalizada. Si ya está cerrada, devolver el mismo contenido sin resultados nuevos. No usar fecha+ejercicio como clave.
- [ ] Implementar ausencia solo sobre pendiente; reprogramación conserva origen y genera visita vinculada; corrección conserva el resultado anterior en evento y modifica solo el resultado/snapshot cerrado. No actualizar la prescripción en correcciones históricas.
- [ ] Añadir pruebas de ejercicio repetido en bloques, dos sesiones del mismo día, cinco alumnos, ejercicio omitido, sesión sin ejercicios, intento de modificar una sesión ajena/cerrada, descanso cero/nulo y datos fuera de rango. Una sesión completamente omitida puede cerrarse sin resultados y queda documentada como tal.
- [ ] Ejecutar esquema/dominio. Commit: `feat/training: track live sessions and auditable changes`.

### Task 4: Continuidad mensual y fechas operativas

**Files:** crear `training-months.js`, `tests/training-months.test.cjs`; modificar consultas de fecha de `model.js` y `calendar.js` al integrar en tarea 5.

**Interfaces:** `TrainingMonths.renew(envelope,date,context)` devuelve copia; `TrainingMonths.draftDifferences(person)` devuelve diferencias `{dayId,week,blockId,exerciseId,field,base,current,draft}`. `draft.baseRoutine` conserva la copia base guardada al crear el borrador.

- [ ] Escribir la prueba de renovación diferida:

```js
test('una sesión abierta difiere la renovación y esta sucede una vez',()=>{
  const c=load(['training-schema.js','training-domain.js','training-months.js']);
  let serial=0;const ctx={id:()=>`month-${++serial}`,now:()=>new Date(2026,9,1,1)};
  let s=c.TrainingDomain.apply(fixture(),{type:'start',operationId:'start',personId:'p1',sessionId:'s1',dayId:'d1',week:4,date:'2026-09-30',time:'23:50'},ctx);
  s=c.TrainingMonths.renew(s,ctx.now(),ctx);
  assert.equal(s.db.people[0].routine.period,'2026-09');
  s=c.TrainingDomain.apply(s,{type:'finish',operationId:'end',sessionId:'s1'},ctx);
  s=c.TrainingMonths.renew(s,ctx.now(),ctx);
  s=c.TrainingMonths.renew(s,ctx.now(),ctx);
  assert.equal(s.db.people[0].routine.period,'2026-10');
  assert.equal(s.db.people[0].archives.length,1);
});
```

- [ ] Ejecutar la prueba y comprobar fallo.
- [ ] Implementar renovación por comparación de periodos `YYYY-MM`: no renovar hacia atrás, ni plantillas, ni alumnos con sesión abierta. Clonar, archivar la anterior sin mutarla, asignar nuevo routineId, fecha/mes/revisión y evento. Renovar directamente al mes actual si hubo meses sin actividad. No crear sesiones ni asistencias para rellenar el salto.
- [ ] Implementar diferencias de borrador mediante base/current/draft y claves de posición; si no existe base para un borrador antiguo, comparar contra la vigente y exigir revisión conservadora al activar. Proteger diferencias estructurales: posiciones eliminadas o movidas requieren reconstruir explícitamente el borrador desde la actual o descartar el viejo, no inferir correspondencia por nombre.
- [ ] Probar fin de año, febrero bisiesto, mes sin uso, mismo mes repetido, reloj hacia atrás y cambios de carga anteriores al cierre. Commit: `feat/routines: renew monthly plans without rewriting history`.

### Task 5: Integrar carga y escrituras de toda la app

**Files:** modificar `model.js`, `app.js`, `experience.js`, `index.html`, `tests/manual-draft.test.cjs`; crear base de `training-controller.js`.

**Interfaces:** `TrainingController.create({repo,snapshot,context,onState})` devuelve controller; `controller.snapshot()` devuelve copia confirmada; `controller.execute(command)` persiste `TrainingDomain.apply`; `controller.commit(operationId,reduce)` persiste otras mutaciones puras; `controller.status()` devuelve `{state:'saved'|'saving'|'error'|'conflict',message}`. Ningún caller puede interpretar Promise como booleano de éxito.

- [ ] Adaptar primero los tests de guardado manual a `await action(...)` y a un repositorio de prueba. Conservar el contrato observable: editar/navegar no guarda borradores; guardar uno no guarda otro; fallar deja el borrador pendiente; activar exige versión guardada y completa.
- [ ] Ejecutar suite y comprobar que falla con arranque síncrono actual.
- [ ] Separar generación de semilla de demo de carga persistente. En boot: abrir repo, cargar v6; si no existe, leer v5 sin borrarlo y migrar; solo si tampoco existe v5 crear semilla. Validar antes de initialize. Mostrar carga hasta terminar y error recuperable si no puede cargar.

```js
// Patrón de escritura usado por el controller:
async function persistCommand(command){
  const confirmed=await repo.transact({expectedRevision:current.revision,operationId:command.operationId},
    snapshot=>TrainingDomain.apply(snapshot,command,context));
  current=confirmed;
  onState({state:'saved',snapshot:structuredClone(current)});
  return confirmed;
}
```

- [ ] Hacer asíncronos `action`, `lifecycleAction`, `saveDraft`, `discardDraft` y sus callers. Retirar el `persist()` incondicional al final de `action`. No escribir por navegar o cerrar un modal. Cada mutación de alumno, visita, plantilla, biblioteca, marca y activación usa una operación explícita que solo anuncia éxito después de commit.
- [ ] Mantener mapas separados de borradores guardados y borradores en trabajo. Actualizar la copia confirmada del alumno sin reemplazar su borrador pendiente en memoria. `saveDraft` añade historial únicamente a su candidato transaccional.
- [ ] Activación: bloquear si hay sesión abierta. Si `draftDifferences` no está vacío, presentar valores vigentes y de borrador por posición; conservar vigente o aceptar borrador mediante elección explícita por diferencia. Guardar la resolución y luego activar en una transacción; si falla no archivar ni perder borrador. Para conflictos estructurales ofrecer recrear desde actual con confirmación de descarte.
- [ ] Sustituir fecha fija operativa por reloj local, rangos relativos y calendario dinámico. Mantener fechas de los registros ficticios. Materializar visitas programadas solo al operar sobre ellas, con clave estable alumno/fecha/horario; combinar agenda habitual y excepciones sin duplicar.
- [ ] Ordenar scripts: data → schema/storage/domain/months/controller → model → ui/vistas existentes → training-views/backup → app. Boot asíncrono precede a `route`; listeners que escriben permanecen deshabilitados hasta ready.
- [ ] Ejecutar regresiones de borrador, catálogo, marca, fechas e inicialización inválida. Commit: `refactor/app: route mutations through confirmed storage`.

### Task 6: Cola de autosave y seguimiento en pantalla

**Files:** completar `training-controller.js`; crear `training-views.js`, `training.css`, `tests/training-controller.test.cjs`; modificar agenda/eventos en `app.js`, `views.js` y calendario.

**Interfaces:** `controller.stage({sessionId,blockId,exerciseId?,field,raw})` mantiene entrada por celda; `flush(sessionId?)` espera guardados válidos y rechaza si hay errores/invalidación; `retry()` reintenta la operación fallida con mismo id; `pending()` devuelve entradas aún no confirmadas; `reloadConflict()` carga lo nuevo y permite reaplicar explícitamente. `trainingScreen(sessionId)` genera seguimiento; `activeSessionSelector()` genera alumnos abiertos.

- [ ] Escribir prueba con repo controlable que mantenga suspendida una transacción, permita abortarla y registre candidatos, usando estos casos:

```js
test('no anuncia guardado antes del commit',async()=>{
  const c=load(['training-schema.js','training-domain.js','training-controller.js']);
  let serial=0;const context={id:()=>`queue-${++serial}`,now:()=>new Date(2026,8,28,10)};
  const initial=c.TrainingDomain.apply(fixture(),{type:'start',operationId:'start',personId:'p1',sessionId:'s1',dayId:'d1',week:2,date:'2026-09-28',time:'10:00'},context);
  let commit,abort,signal;
  const started=new Promise(resolve=>{signal=resolve});
  const repo={transact:({expectedRevision,operationId},reduce)=>new Promise((resolve,reject)=>{
    commit=()=>{const value=reduce(structuredClone(initial));value.revision=expectedRevision+1;value.operationIds.push(operationId);resolve(value)};
    abort=()=>reject(Object.assign(new Error('Fallo simulado'),{code:'WRITE_FAILED'}));signal();
  })};
  const controller=c.TrainingController.create({repo,snapshot:initial,context,onState:()=>{}});
  controller.stage({sessionId:'s1',blockId:'b1',exerciseId:'e1',field:'weight',raw:'22'});
  const pending=controller.flush('s1');await started;
  assert.equal(controller.status().state,'saving');
  assert.equal(controller.snapshot().db.sessions[0].blocks[0].exercises[0].weight,20);
  commit();await pending;
  assert.equal(controller.status().state,'saved');
  assert.equal(controller.snapshot().db.sessions[0].blocks[0].exercises[0].weight,22);
});
```

- [ ] Probar fallo inicial y luego implementar una cola global serial: cada comando se construye sobre la última revisión confirmada. Coalescer tecleo por clave celda durante 300 ms; mantener separado el valor mostrado del confirmado. Si llega otro cambio mientras hay commit, no borrar el nuevo pendiente al resolver el anterior. Si falla, detener la cola hasta reintento/resolución; no saltar un cambio fallido para cerrar.
- [ ] Implementar panel de alumnos activos, resumen pendiente/en curso/finalizado/ausente y vista de bloques. Cada input usa `data-session-id`, `data-block-id`, `data-exercise-id`, `data-field`; el handler captura esas claves al iniciar, nunca consulta el alumno seleccionado cuando resuelve un guardado.
- [ ] Usar eventos `input`, `focusout` y Enter. Actualizar estado de guardado y errores sin reemplazar `innerHTML` del input enfocado. Cambiar de alumno inicia flush y conserva los pendientes del anterior, aunque falle; el aviso queda visible en su tarjeta. Guardar bloque abierto/posición por sessionId en contexto de navegación.
- [ ] Añadir modal breve para iniciar: día y semana; alta rápida con alumno y hora; ausencia y reprogramación por visitId. Botón finalizar espera flush, muestra ejercicios omitidos y confirma lo realizado; se deshabilita durante cierre y el dominio protege reintentos.
- [ ] `beforeunload` alerta únicamente si hay pendientes. `visibilitychange` intenta flush sin afirmar que completará después de cerrar; recuperar foco vuelve a consultar fecha/mes y detecta revisión desactualizada. Conflicto muestra la versión nueva y conserva los valores locales para aplicar/rechazar explícitamente.
- [ ] Probar vacío/negativo, invalidación mientras hay escritura en vuelo, Enter antes de debounce, alternar cinco alumnos y cierre con fallo. Commit: `feat/ui: autosave live training across active students`.

### Task 7: Bloques editables, descansos, historial y documentos

**Files:** modificar `experience.js`, `app.js`, `views.js`, `ui-core.js`, `history.js`, `model.js`, `training-views.js`, `training.css`; ampliar pruebas de dominio y borrador.

**Interfaces:** reutilizar `day.blocks`; `routineChanges(before,after)` recorre bloques y posiciones; `historyEntries(person)` agrupa nuevos resultados por sessionId; `progressData()` filtra cerradas conservando registros legacy.

- [ ] Añadir tests de bloque creado/reordenado/eliminado, ejercicio repetido y descanso macro/micro en borrador, activación, historial y preview. Verificar que plantillas y otros alumnos no cambian al copiar/editar.
- [ ] Ejecutar suite para ver los fallos por acceso a zonas fijas.
- [ ] Sustituir lecturas `.mobility`, `.approximation`, `.main` fuera de migración por recorridos de bloques. Conservar tipo para la selección de ejercicios de parte principal en métricas. El editor añade «Agregar bloque», nombre/tipo, mover/quitar y macro; cada fila tiene inputs inline y micro. Crear ids una vez y mantenerlos al propagar semanas.

```js
// Recorrido compartido por recuentos y documentos:
const rows=day.blocks.flatMap(block=>block.exercises.map(exercise=>({block,exercise})));
const mainRows=rows.filter(({block})=>block.type==='main');
// Mostrar null como 'Sin definir' o '—', nunca como cero.
```

- [ ] Actualizar arrastre y alternativa con botón para destinos blockId; delegar acciones para permitir cualquier cantidad de bloques. Formularios de números usan parseField. Archivos históricos siguen de solo lectura.
- [ ] Historial muestra fecha/hora, before/after, bloque y sesión para cambios nuevos; registros previos mantienen rótulo honesto. Resultados usan clave sessionId/blockId/exerciseId, orden por inicio/registro y comparación contra sesión previa, incluso en el mismo día. Progreso no cuenta eventos intermedios.
- [ ] Actualizar previews de rutina y progreso con mes, bloques y descansos, incluidos los renderizadores reemplazados en experience.js. Mantener PDF como preview, no anunciar exportación real.
- [ ] Ejecutar pruebas y verificar que búsquedas de zonas fijas restantes pertenecen solo a migración/fixtures. Commit: `feat/routines: support flexible blocks and inline values`.

### Task 8: Copias exportables y restauración segura

**Files:** crear `training-backup.js`, `tests/training-backup.test.cjs`; conectar acciones y UI en `app.js`/`views.js`.

**Interfaces:** `TrainingBackup.exportText(snapshot)` devuelve JSON con formato `{format:'pulso-backup',exportedAt, data:envelope}`; `parse(text)` valida y devuelve envelope; `restore(repo,backup,{expectedRevision,operationId,hasPending})` exige sin sesión abierta ni pendientes en el destino y devuelve commit con revisión local creciente. La copia puede contener sesiones abiertas válidas para permitir recuperarlas. El controller se recarga tras restaurar.

- [ ] Añadir prueba de ida y vuelta y rechazo antes de escritura:

```js
test('el respaldo conserva datos y rechaza contenido roto',()=>{
  const {TrainingBackup:B}=load(['training-schema.js','training-backup.js']);
  const source=fixture(),restored=B.parse(B.exportText(source));
  assert.equal(JSON.stringify(restored.db),JSON.stringify(source.db));
  assert.throws(()=>B.parse('{'));
  assert.throws(()=>B.parse(JSON.stringify({format:'otro',data:source})));
});
```

- [ ] Ejecutar fallo inicial; implementar exportación exclusivamente desde snapshot confirmado, validación recursiva y restauración transaccional. No usar objetos del archivo para modificar prototipos o HTML; escapar textos y validar claves estructurales.
- [ ] Ofrecer descarga Blob JSON con nombre/fecha y revocar URL después de usarla. Si hay cambios pendientes, explicar que la copia solo contiene lo confirmado. Una copia con sesiones abiertas se puede restaurar en un destino sin sesiones abiertas ni pendientes; comprobar la regla de una abierta por alumno y recuperar únicamente sus valores confirmados.
- [ ] Antes de restaurar: mostrar cantidades de alumnos, sesiones y períodos; ofrecer descargar estado actual; confirmar reemplazo. Aplicar nuevo revision y operationId del destino, no importar contador viejo para el control de concurrencia. Si falla, mantener destino sin cambios.
- [ ] Probar versión futura, referencias rotas, doble restore, estado abierto y fallo de commit. Commit: `feat/backup: export and restore validated local data`.

### Task 9: Verificación integrada y entrega

**Files:** completar pruebas de navegador, actualizar `README.md`, `docs/verification.md`; corregir solo defectos encontrados por escenarios del alcance.

**Interfaces:** app completa y página aislada de pruebas con resultado visible por escenario. Las pruebas deben crear su propio origen/perfil/base; no reutilizar datos reales del usuario.

- [ ] Ejecutar suites Node con `node --test tests/*.test.cjs` y `node --check` por cada JS modificado. Si PowerShell/Node no expande el glob, obtener archivos con `Get-ChildItem tests -Filter '*.test.cjs'` y pasarlos como array a Node.
- [ ] Servir con `python -m http.server 4173 --bind 127.0.0.1` si Python está disponible; si no, usar el runtime local descubierto. Leer la habilidad de navegador antes de controlarlo. No instalar dependencias de producto para servir estáticos.
- [ ] Verificar en navegador real: cinco sesiones con 20→22→24 en ediciones separadas; alternar y recargar; doble cierre; dos sesiones en un día; fallo de escritura; dos pestañas; ausencia; walkin; bloques/descansos; renovación con sesión abierta; borrador desactualizado; exportar/restaurar. Evidenciar el guardado leyendo de una nueva conexión, no solo observando el DOM.
- [ ] Para simular fallo sin llenar el disco, inyectar un repo que aborte la próxima transacción desde el arnés de pruebas. Volver a repo real para confirmar recuperación y ausencia de duplicados. Para concurrencia usar dos conexiones/pestañas reales y comprobar que la operación rechazada no alteró la primera.
- [ ] Revisar 1440 y 390 px: selector de alumnos alcanzable, controles táctiles, foco estable, teclado, ausencia de desborde horizontal, etiquetas/errores y contraste de estados. Capturar escritorio y móvil después de guardar y después de un error.
- [ ] Actualizar documentos con resultados ejecutados, entorno y límites. No describir escenarios planificados como aprobados. No afirmar backend, respaldo automático externo o PDF real. Mencionar que borrar el almacenamiento local elimina datos y que el backup debe guardarse fuera del dispositivo para cubrir su pérdida.
- [ ] Revisar diff completo, `git diff --check` y estado final. Hacer revisión independiente al terminar según método de ejecución elegido; resolver hallazgos y repetir solamente pruebas afectadas. Commit final: `docs: record live training verification and local storage limits`.

## Auto-revisión del plan

- Criterios 1–5 del diseño: tareas 2, 3, 5, 6 y 9.
- Migración y protección de datos anteriores: tareas 1, 2, 5 y 9.
- Faltas y llegadas: tareas 3 y 6.
- Bloques, descansos, documentos e historial: tareas 3 y 7.
- Renovación mensual y borradores: tareas 4 y 5.
- Respaldo/restauración: tarea 8 y validación integrada en tarea 9.
- Accesibilidad y regresiones: tareas 5–7 y 9.

Orden de ejecución: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. Las tareas comparten contratos y se ejecutan secuencialmente. Recomendación: ejecución directa en este chat y revisión independiente final. Este archivo define el trabajo; las casillas permanecerán sin marcar hasta ejecutar y comprobar cada paso.
