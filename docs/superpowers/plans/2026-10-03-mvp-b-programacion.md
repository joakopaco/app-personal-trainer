# B — Alumnos, biblioteca y programación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: usar superpowers:executing-plans o superpowers:subagent-driven-development al ejecutar. Cada tarea termina con pruebas relevantes y commit.

**Goal:** El entrenador puede crear alumnos, organizar visitas y publicar rutinas por bloques.
**Architecture:** Documentos de rutina versionados y entidades de agenda relacionales dentro del espacio privado.
**Tech Stack:** React/TypeScript, Postgres RPC/RLS, Supabase Storage, Vitest/pgTAP/Playwright.
**Spec:** [Diseño](../specs/2026-10-03-mvp-web-cloud-design.md); [contratos](2026-10-03-mvp-web-cloud.md). Depende de A.

## Global Constraints

- Las plantillas son independientes de sus copias asignadas.
- No reemplazar toda una cuenta mediante un JSON del navegador.
- Cada entrenador tiene su espacio y sus propios alumnos.
- Una persona tiene una sola sesión abierta confirmada; puede tener varias finalizadas el mismo día.

## Review Focus

IDs repetidos entre semanas, copia de plantilla ligada por referencia, faltas que cambian el horario recurrente, catálogo privado expuesto, borrador viejo que pisa valores en vivo.

## B1. Dominio tipado y fichas

**Archivos:** packages/domain/src/{numbers,routines,sessions,dates}.ts; apps/web/src/features/students/{StudentList,StudentForm,StudentProfile}.tsx; supabase/migrations/*_students_rpc.sql; tests/unit/{numbers,routine-copy}.test.ts; tests/e2e/students.spec.ts.

**Consume:** espacio autorizado. **Produce:** StudentSnapshot/StudentPatch, parseWeight(raw), cloneRoutineDocument(document,idFactory), consultas paginadas y RPC create_student/update_student/archive_student.

- [ ] Portar regresiones v6 útiles. Añadir pruebas de coma decimal, cero, vacío, 22.5 kg, duración y copia independiente.
- [ ] Definir esquema de RoutineDocument: schemaVersion=1, name, weeks[4], dayId, blockId, lineageId, type, order, macroRest/macroTarget, exercise positions y prescription. Validar límites del diseño en TS y DB.
- [ ] Implementar ficha mínima: nombre, alias opcional, horario, notas privadas y estado. Requerir nombre, limitar longitudes; texto sin HTML.
- [ ] RPC actualiza revisión/auditoría del alumno; archivar bloqueado si tiene sesión abierta o solicita cerrarla primero. Restaurar no crea copia duplicada.
- [ ] Ejecutar unit + students e2e + RLS de nuevas tablas. Commit: feat/students: add private roster and typed training values.

~~~ts
expect(parseWeight('22,5')).toEqual({ ok: true, value: 22.5 });
expect(parseWeight('')).toEqual({ ok: false });
expect(parseWeight('0')).toEqual({ ok: true, value: 0 });
~~~

## B2. Catálogo curado y multimedia

**Archivos:** packages/catalog/{manifest.json,credits.json}; scripts/catalog/{validate,import}.ts; apps/web/src/features/catalog/{ExerciseSearch,ExerciseDetail,MediaPlayer,CustomExercise}.tsx; supabase/migrations/*_catalog_storage.sql; tests/unit/catalog.test.ts; tests/e2e/catalog.spec.ts.

**Consume:** investigación de licencias, IDs de catálogo y espacio A3. **Produce:** ExerciseDefinition (tipo, músculos, equipo, aliases), ExerciseMedia (origen, hash, licencia, atribución, dimensiones).

- [ ] Prueba que rechace un medio sin licencia/origen/hash, un SVG con script y un ejercicio sin tipo válido.
- [ ] Seleccionar 100–150 ejercicios con el entrenador. Fijar fuente/commit; generar catálogo español y tabla de correspondencias sin copiar traducciones de procedencia desconocida.
- [ ] Importar solo medios aprobados con créditos. Sanear SVG en pipeline y servirlo como imagen; video privado validado. Tests Storage con A/B y objeto no autorizado.
- [ ] Construir búsqueda por nombre/alias/músculo/equipo, favoritos y ejercicio propio. Detalle con poster/play/pausa, reduced-motion y fallback sin medio/red.
- [ ] Ejecutar unit/catalog, catálogo e2e y pruebas de políticas. Commit: feat/catalog: add curated exercises and attributed media.

Contrato de validación:

~~~ts
type MediaLicense = {
  sourceUrl: string; sourceRevision: string; creator: string;
  licenseId: string; licenseUrl: string; sha256: string; modifications: string;
};
// validateCatalog devuelve errores con exerciseId/path; import aborta si hay alguno.
~~~

Favoritos se guardan por entrenador, no en el catálogo público. Búsqueda global jamás devuelve ejercicios privados de otro espacio.

## B3. Constructor y publicación de rutinas

**Archivos:** apps/web/src/features/routines/{RoutineBuilder,BlockEditor,InlinePrescription,DraftComparison}.tsx; packages/domain/src/routine-diff.ts; supabase/migrations/*_routines.sql, *_routine_commands.sql; tests/unit/routine-diff.test.ts; supabase/tests/routines.test.sql; tests/e2e/routine-builder.spec.ts.

**Consume:** RoutineDocument y catálogo. **Produce:** routine_templates, routine_periods, routine_revisions, routine_drafts; save_draft/publish_routine según plan maestro.

- [ ] Pruebas: crear cuatro bloques, repetir ejercicio en dos posiciones, reordenar/copiar y modificar una copia sin cambiar origen.
- [ ] Implementar edición inline y copia por bloque/día/semana; botones alternativos al arrastre. Campos incompletos pueden guardarse en borrador pero no publicarse.
- [ ] Publicar crea revisión inmutable, conserva anterior y cambia puntero en transacción. Validar propietario, revisión del alumno, base y sesión abierta con bloqueo; no confiar en el estado de UI.
- [ ] Comparar base/remoto/borrador y resolver por campo; cambio estructural exige rebase explícito. Guardar otra ficha no persiste un borrador incompleto.
- [ ] Probar publicación simultánea en dos conexiones y vista de impresión con bloques/descansos. Commit: feat/routines: publish versioned monthly block programs.

Prueba SQL clave: dos intentos con expected_revision idéntica; solo uno publica, el otro devuelve conflict y ambas revisiones conservan su contenido. El snapshot de una sesión anterior sigue enlazando a su revisión original.

## B4. Agenda y continuidad mensual

**Archivos:** apps/web/src/features/agenda/{Today,Calendar,VisitActions,QuickStart}.tsx; packages/domain/src/schedule.ts; supabase/migrations/*_visits_periods.sql; supabase/tests/calendar.test.sql; tests/e2e/agenda.spec.ts.

**Consume:** alumnos y rutinas publicados. **Produce:** schedule_rules/visits; mark_absent/reschedule_visit/ensure_period y selector de inicio usado en C3.

- [ ] Pruebas de lunes recurrente, falta sin nueva visita, reprogramación vinculada, llegada espontánea y horario sin mutación.
- [ ] Definir claves de ocurrencia para no duplicar visitas al regenerar calendario; conservar excepciones. Cancelaciones separadas de faltas.
- [ ] Implementar ensure_period bajo bloqueo del alumno, período único y relación continued_from. Renovar al acceso/inicio/cierre con reloj del servidor y zona; no usar cron como único mecanismo.
- [ ] Pruebas del día 31, febrero, año nuevo, meses sin uso, dos renovaciones simultáneas y sesión abierta. Rechazar silenciosa propagación de una sesión offline de un período reemplazado; C4 completa reconciliación.
- [ ] Ejecutar pgTAP + agenda e2e. Commit: feat/agenda: add visit exceptions and safe monthly continuity.

Regla comprobable:

~~~text
given alumno con septiembre vigente y sesión abierta
when ensure_period(octubre)
then no duplica ni archiva todavía
when cierra sesión y ensure_period(octubre) se repite dos veces
then existe un período octubre y septiembre conserva su última revisión
~~~

## Salida B

En una cuenta vacía se puede crear un alumno, programar un día, publicar una rutina y registrar una falta. En computadora se edita cómodamente; en celular se consulta sin desbordes. Todavía no se declara completo el entrenamiento offline.
