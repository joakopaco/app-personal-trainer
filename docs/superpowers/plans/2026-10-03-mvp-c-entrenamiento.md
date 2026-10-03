# C — Entrenamiento y sincronización — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: usar superpowers:executing-plans o superpowers:subagent-driven-development al ejecutar. No liberar basándose únicamente en pruebas de estado optimista de React.

**Goal:** Atender cinco alumnos y conservar ejecución, rutina e historial frente a red inestable y uso desde dos dispositivos.
**Architecture:** Comandos idempotentes en Postgres, cola local durable por alumno, proyección local separada de la confirmada y reconciliación explícita.
**Tech Stack:** TypeScript, Dexie/IndexedDB, Supabase RPC/Realtime, Vitest, Playwright, pgTAP.
**Spec:** [Diseño](../specs/2026-10-03-mvp-web-cloud-design.md); [contratos](2026-10-03-mvp-web-cloud.md). Depende de A y B.

## Global Constraints

- Una persona tiene una sola sesión abierta confirmada; puede tener varias finalizadas el mismo día.
- Nunca mostrar «Sincronizado» por tener internet o recibir un evento Realtime.
- Una serie ya confirmada nunca cambia por editar después la prescripción. Solo una corrección expresa la modifica y registra antes/después.
- No reemplazar toda una cuenta mediante un JSON del navegador.

## Review Focus

Commit remoto sin respuesta; dos pestañas emisoras; cambio de cuenta con peticiones pendientes; cierre offline antes de enviar cambios; borrador o período nuevo mientras otro dispositivo sigue offline.

## C1. Motor transaccional de sesiones

**Archivos:** supabase/migrations/*_sessions.sql, *_training_commands.sql; supabase/tests/{training_commands,idempotency}.test.sql; packages/domain/src/{commands,session-projection}.ts; tests/unit/session-projection.test.ts.

**Consume:** apply_training_command y recibos de A3, períodos/revisiones B3, payloads del plan maestro. **Produce:** start_session/adjust_prescription/record_set/skip_item/finish_session/correct_result y respuestas CommandReply.

- [ ] Escribir casos de doble inicio, ejercicio repetido en dos bloques, ajuste semanal, serie observada inmutable, doble cierre y corrección con motivo.
- [ ] Crear sessions/items/sets con PK/FK compuestas e índice único parcial por alumno cuando status=open. Capturar snapshot de prescripción al iniciar.
- [ ] Extender el dispatcher autorizado. El ajuste de prescripción crea nueva revisión de rutina y evento; modifica solo series pendientes compatibles. Detalle de serie guarda ejecución sin cambiar automáticamente objetivo.
- [ ] Cierre confirma quickConfirmItemIds válidos, marca origen, mantiene observados y excluye omitidos. Si hay error, rollback completo; ninguna fila parcial ni recibo de éxito.
- [ ] Probar dos conexiones y rollback inyectado antes del recibo. Ejecutar tests de DB y dominio. Commit: feat/training: commit sessions prescriptions and audit atomically.

Orden requerido dentro de la transacción:

~~~text
validar auth.uid y ownership de workspace/student
bloquear alumno (SELECT ... FOR UPDATE)
buscar recibo de operation_id
  si hash coincide: devolver respuesta original
  si hash difiere: ID_REUSED
comprobar expected_revision y estado/ownership de todas las referencias
aplicar comando + nueva revisión + auditoría
insertar recibo con hash y respuesta canónica
commit
~~~

Orden fijo de locks para evitar interbloqueo: alumno → período → sesión. No devolver recibos ajenos antes de validar ownership. La operación de rutina publicada en B3 usa el mismo bloqueo.

## C2. Cola local durable y envío

**Archivos:** packages/sync/src/{local-db,outbox,worker,gateway,account-scope}.ts; apps/web/src/adapters/supabase-gateway.ts; tests/unit/{outbox,worker}.test.ts; tests/e2e/offline-recovery.spec.ts.

**Consume:** CloudGateway/LocalStore/CommandEnvelope. **Produce:** stage(), listPending(), acknowledge(), purge(), subscribeSaveState(scope,studentId), drainStudent(scope,studentId).

- [ ] Pruebas de transacción IndexedDB abortada, cierre/recarga tras stage y edición nueva mientras un envío anterior responde.
- [ ] Persistir rawInputs, proyección y outbox en transacciones; no anunciar guardado hasta completion. Al compactar tecleo, solo combinar operaciones todavía no enviadas y conservar último valor válido y texto pendiente.
- [ ] Worker FIFO por alumno, backoff con jitter, límites de reintento automático, 401→auth-required, 409→conflict, validación→rejected. No frenar alumnos independientes.
- [ ] Elegir emisor entre pestañas con Web Locks cuando esté disponible y lease local con expiración como fallback. El servidor deduplica aunque ambos envíen; no basarse solo en el lease para integridad.
- [ ] Probar respuesta perdida después de commit, reinicio del worker y reenvío con mismo ID. Una lectura desde cliente nuevo debe mostrar un cambio y un evento. Commit: feat/sync: persist offline commands and replay idempotently.

Contrato de recuperación que la prueba ejecuta:

~~~text
stage(A, comando 40→42) -> confirma IndexedDB
servidor aplica, red pierde respuesta
cerrar cliente y abrir nuevo LocalStore para A
reenviar mismo comando -> duplicate
leer DB desde otra conexión -> 42, un solo evento, cola vacía
~~~

Después de esta tarea se reemplaza el guard provisional de A4 por la outbox real. Purge nunca se ejecuta automáticamente sobre pendientes sin decisión explícita.

## C3. Seguimiento móvil con varios alumnos

**Archivos:** apps/web/src/features/live/{ActiveStudents,TrainingScreen,ExerciseRow,SetDetails,SaveIndicator,FinishDialog,RestTimer}.tsx; packages/domain/src/timers.ts; tests/e2e/live-training.spec.ts; tests/unit/timers.test.ts.

**Consume:** selector de inicio B4, stage C2, snapshots y estados. **Produce:** flujo completo Hoy→inicio→ajustes→cierre.

- [ ] Prueba e2e: cinco alumnos, carga distinta para cada uno, navegar y volver, conservar identidad/campo/scroll. No usar el alumno seleccionado al resolver una petición anterior.
- [ ] Implementar entradas inline, teclado numérico, select-all accesible, anterior visible y captura estable de sessionId/itemId/setId. Evitar reemplazar el input enfocado con cada respuesta.
- [ ] Modo rápido + detalle de series según spec. Explicar alcance de propagación junto al campo; ajustes de serie observada no reescriben otras series.
- [ ] Temporizadores guardan endAt, pausedRemaining y sesión; al reabrir recalculan diferencia. Sin promesa de alarma en segundo plano web. Cierre offline pasa a Finalización pendiente y preserva cola.
- [ ] Prueba real con teclado abierto en Android/iOS, 360/390 px y desktop. Pruebas de navegación teclado y etiquetas. Commit: feat/live: add fast multi-student training workspace.

Prueba pura del reloj:

~~~ts
expect(remainingSeconds({ endAt: 90_000 }, 30_000)).toBe(60);
expect(remainingSeconds({ endAt: 90_000 }, 120_000)).toBe(0);
~~~

remainingSeconds(timer,nowMs) se implementa sin intervalos ni dependencia del reloj global; intervalos solo redibujan.

## C4. Conflictos y recuperación entre dispositivos

**Archivos:** packages/sync/src/{reconcile,refresh,lease}.ts; apps/web/src/features/live/ConflictReview.tsx; apps/web/src/features/settings/SyncCenter.tsx; tests/e2e/{two-devices,offline-period,account-switch}.spec.ts.

**Consume:** cola y revisiones. **Produce:** conflicto revisable, applyResolution()/discardResolution(), nueva cola reconstruida y consulta tras reconexión.

- [ ] Prueba A/B: ambos parten de 40, A guarda 42, B propone 44. Mostrar 42 vs 44 sin escribir por cargar la versión nueva.
- [ ] Comparación de tres versiones por campo; conflicto exige resolución, manda nuevo operationId y preserva cadena de dependencias. Descartar no reintroduce el valor descartado por una operación posterior.
- [ ] Realtime solo invalida; recuperar foco/red fuerza consulta de revisión. Ignorar payload no autorizado y no reiniciar edición enfocada.
- [ ] Escenarios: servidor cerró sesión; publicación de borrador concurrente; mes nuevo contra sesión offline; alumno archivado; token vencido; misma cuenta en otra pestaña; cuenta diferente. Mantener pendientes exportables si no pueden aplicarse.
- [ ] En reconciliación de sesión antigua: comando separado de importación de ejecución que no actualiza rutina nueva, motivo auditado y vista previa. Probar que no crea segunda sesión abierta. Commit: feat/sync: resolve cross-device conflicts without silent overwrite.

SyncCenter muestra alumnos con pendientes, edad, motivo y reintentar/revisar. No es un botón «forzar todos» que omita validaciones.

## C5. Historial y progreso verificables

**Archivos:** packages/domain/src/metrics.ts; apps/web/src/features/history/{Timeline,SessionResult,CorrectionDialog}.tsx; apps/web/src/features/progress/{ProgressPage,ExerciseChart,AttendanceChart,MuscleDistribution}.tsx; supabase/migrations/*_progress_queries.sql; tests/unit/metrics.test.ts; tests/e2e/history.spec.ts.

**Consume:** resultados confirmados, auditoría, catálogo y legacy marcado. **Produce:** métricas filtradas con tabla accesible, exportación de resultados y correcciones auditadas.

- [ ] Fixture con dos sesiones mismo día, calentamiento, omitido, serie por tiempo y corrección. Calcular resultados esperados manualmente.
- [ ] Implementar volumen únicamente con series elegibles y cerrar antes de contarlas. Mostrar mejor carga con reps, no como progreso absoluto sin contexto.
- [ ] Tabla/gráfico comparten el mismo selector; estado sin datos explícito. Mapa usa series de músculos principales y explica secundarios.
- [ ] Corrección con motivo crea audit_event y recalcula; original sigue consultable. Historial paginado por timestamp de servidor + ID, con hora de captura aparte.
- [ ] Probar aislamiento en agregados/vistas, CSV neutralizando fórmulas en campos de texto y orden del mismo día. Commit: feat/progress: add auditable history and evidence-based charts.

Ejemplo numérico de aceptación: series de trabajo 20×10 y 25×8 aportan 400 kg·rep; una de calentamiento 10×10, una omitida y una plancha de 30 s no aumentan ese valor. Una corrección de 25×8 a 22.5×8 deja 380 kg·rep y conserva antes/después.

## Salida C

La prueba maestra alterna cinco alumnos, corta red, cierra/reabre, edita desde otra conexión y reconcilia. Debe producir exactamente los valores/series/eventos esperados sin avisos falsos de sincronización. Todavía se necesita D para datos reales.
