# Pulso · Seguimiento para personal trainers

La evolución a MVP web con cuentas, Supabase y Vercel está documentada en [Plan de desarrollo del MVP](docs/PLAN-MVP.md). Es una propuesta para revisión; la aplicación actual sigue siendo la demo local descrita abajo.

Servir con `python -m http.server 4175 --bind 127.0.0.1` y abrir http://127.0.0.1:4175/#agenda. Mantener el mismo navegador y origen (dirección y puerto) para recuperar los datos locales.

## Entrenamiento en vivo · revisión 6

- Agenda con visitas pendientes, en curso, finalizadas, faltas y reprogramaciones. «No asistió» no exige otra fecha. «Agregar entrenamiento ahora» permite elegir alumno, día y semana, con la hora actual precargada.
- «Entrenando ahora» permite alternar entre sesiones abiertas de distintos alumnos. Una persona solo tiene una sesión abierta; puede realizar varias sesiones consecutivas en el mismo día.
- Peso, series, repeticiones y descansos se editan directamente. Los cambios válidos se guardan automáticamente después de 300 ms, al salir del campo o con Enter. La interfaz distingue guardando, confirmado, error y conflicto con otra pestaña.
- Un ajuste actualiza la sesión y el mismo ejercicio de la rutina desde la semana elegida en adelante. Historial conserva valor anterior, nuevo, fecha y hora. Un ejercicio repetido en otro bloque es independiente.
- «No se realizó» excluye ese ejercicio del resultado final. «Finalizar entrenamiento» confirma los ejercicios restantes y cierra una sola vez. Progreso consulta resultados finalizados; las modificaciones intermedias no multiplican entrenamientos.
- Una sesión abierta se recupera tras recargar. Las correcciones de sesiones finalizadas conservan auditoría y no cambian la rutina vigente.

## Rutinas y bloques

Cada día admite bloques con nombre, tipo, orden y ejercicios. Micro es el descanso entre ejercicios; macro se configura entre series o entre bloques. Se expresan en segundos: vacío significa sin definir y cero significa sin pausa.

Las rutinas se asignan a un mes calendario. Si no se activa otra, al abrir la app en un mes nuevo se archiva el período anterior y se continúa con una copia y los últimos valores. Las sesiones abiertas posponen esa renovación hasta el cierre. Los días 29–31 usan la cuarta variante semanal por defecto. No se inventan sesiones en meses sin uso.

Los cambios estructurales usan un borrador con **Guardar borrador** y **Activar rutina**. Los campos se editan en la tabla. Activar se bloquea si hay un entrenamiento abierto o si existen cambios en vivo posteriores a la base del borrador sin resolver. Las plantillas usan **Guardar plantilla**, de manera explícita; sus copias en alumnos son independientes.

## Persistencia y respaldo

IndexedDB conserva una instantánea versionada. Sesión, rutina e historial se escriben en una transacción. La app solo anuncia guardado después de confirmar la transacción. Las revisiones detectan conflictos entre pestañas y evitan sobrescribir una versión nueva con una vieja. La clave localStorage `pulso-demo-v5` se migra sin borrarla; datos inválidos muestran un error y no se reemplazan automáticamente por una demo.

Ante un fallo, los campos pendientes permanecen en esta pestaña para reintentar. **Un cambio pendiente no está protegido si se cierra el navegador.** Los formularios y las plantillas requieren resolver o reingresar sus cambios cuando hay un conflicto entre pestañas.

Desde Agenda → Copias de respaldo se descarga un JSON de los datos confirmados. La restauración valida y pide confirmar el reemplazo. No permite reemplazar un destino con sesiones abiertas o cambios pendientes. Una copia puede recuperar sesiones abiertas si el destino está libre. Guardar una copia fuera del dispositivo protege frente a su pérdida.

Esta sigue siendo una demo local: no incluye cuentas, servidor, sincronización entre equipos ni respaldos automáticos externos. Borrar los datos del navegador elimina esta base. Para usar datos reales hace falta implementar y verificar almacenamiento remoto con respaldos y recuperación. Los documentos son previews HTML, no PDF exportados.

## Verificación

`node --test tests/*.test.cjs` ejecuta pruebas del modelo, migración, errores de escritura, cola de autosave, sesiones, continuidad, respaldos y regresiones. En PowerShell se puede usar `$testFiles = (Get-ChildItem tests -Filter '*.test.cjs').FullName; node --test $testFiles`.

Abrir `/tests/browser/training-checks.html` y ejecutar las comprobaciones prueba IndexedDB real en una base temporal aislada, sin modificar los datos de la aplicación. El detalle de pruebas ejecutadas está en `docs/verification.md`.

## Estructura

- `training-schema.js`, `training-storage.js`: validación, migración y persistencia transaccional.
- `training-domain.js`, `training-months.js`: sesiones, visitas, cambios e historial mensual.
- `training-controller.js`: cola de guardado y entradas pendientes.
- `training-app.js`, `training-editor.js`, `training-views.js`, `training.css`: integración, bloques y seguimiento.
- `training-backup.js`: copias exportables y restauración.
- `model.js`, `app.js`, `views.js`, `experience.js`, `history.js`, `calendar.js`: funcionalidades existentes integradas.
- `data.js`, `anatomy.js`, `ui-core.js`, `styles.css`, `experience.css`: datos ficticios, mapa corporal y base visual.
