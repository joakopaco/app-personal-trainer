# Pulso MVP web cloud — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans o superpowers:subagent-driven-development al ejecutar. Las casillas de los subplanes se marcan únicamente después de implementar y comprobar.

**Goal:** Entregar un MVP web para 1–5 entrenadores independientes, con seguimiento presencial desde celular y administración desde computadora.

**Architecture:** Frontend React/Vite desplegado en Vercel; Supabase Auth/Postgres/Storage, comandos transaccionales y sincronización con cola local durable. Dominio independiente de la UI para reutilizarlo después en apps móviles.

**Tech Stack:** TypeScript, React, Vite, cliente Supabase, Dexie, Vitest, Playwright, SQL/pgTAP. Versiones compatibles fijadas al ejecutar A1.

**Spec:** [Diseño completo](../specs/2026-10-03-mvp-web-cloud-design.md). Leer también la [investigación](../../research/2026-10-03-referencias-producto.md).

Estado: planificación, ninguna tarea de este plan ejecutada. La implementación v6 previa es la referencia funcional, no prueba del backend futuro.

## Global Constraints

- Solo los entrenadores tienen login; los alumnos son fichas administradas por ellos.
- Cada entrenador tiene su espacio y sus propios alumnos.
- El piloto empieza con un entrenador; como máximo cinco inicialmente.
- Una persona tiene una sola sesión abierta confirmada; puede tener varias finalizadas el mismo día.
- Nunca mostrar «Sincronizado» por tener internet o recibir un evento Realtime.
- Una serie ya confirmada nunca cambia por editar después la prescripción. Solo una corrección expresa la modifica y registra antes/después.
- Las plantillas son independientes de sus copias asignadas.
- No reemplazar toda una cuenta mediante un JSON del navegador.

## Review Focus

| Riesgo | Prueba responsable |
|---|---|
| RLS correcto en UI pero RPC/Storage permite otro entrenador | A3: dos JWT, IDs cruzados, llamadas directas, grants y archivos |
| Respuesta perdida duplica cierre o cambio | C1/C2: commit exitoso, timeout cliente y reenvío con mismo ID |
| Pendientes de una cuenta aparecen/envían en otra | A4/C2: logout, token vencido, nuevo usuario y bases locales separadas |
| Rutina nueva o cambio de mes destruye una ejecución anterior | B3/B4/C4: publicar/renovar contra sesión abierta y sesión offline antigua |
| Cifras de progreso confunden prescripción con ejecución | C5/D1: serie observada, rápida, omitida, corregida y legacy agregado |

## 1. Límites de la implementación

Partir del commit bd3b15e y conservar la demo. No ejecutar sobre un checkout con cambios ajenos sin inventariarlos. Preferir el worktree actual si sigue disponible; preparar una rama codex/mvp-web-cloud al iniciar desarrollo. Estos documentos se conservan en la rama de trabajo actual, sin integrar ni publicar.

No migrar en bloque el DOM viejo ni subir DB como JSON completo a Supabase. Portar reglas y pruebas, luego reemplazar pantallas por módulos funcionales. Ningún repositorio externo se usa como dependencia de producto sin la revisión de licencia indicada.

La planificación solicitada incluye diseño y subplanes en una sola entrega. No se utiliza esa entrega como autorización para escribir producto, crear cuentas o contratar recursos.

## 2. Estructura propuesta

~~~text
apps/web/
  src/app/                 router, shell, proveedores
  src/features/auth/       login, recuperación, cierre seguro
  src/features/students/   fichas y archivo
  src/features/agenda/     visitas y llegadas
  src/features/catalog/    búsqueda y detalle multimedia
  src/features/routines/   constructor, borradores y publicación
  src/features/live/       alumnos activos, filas, series, cierre
  src/features/history/    auditoría y resultados
  src/features/progress/   consultas, tablas y gráficos
  src/features/settings/   exportación, cuenta y sincronización
  src/components/          controles visuales compartidos
  src/adapters/            cliente Auth, Supabase, reloj y capacidades web
  public/                  manifest, iconos y recursos autorizados
packages/domain/src/       contratos, validaciones, rutinas, sesiones, métricas
packages/sync/src/         IndexedDB, outbox, emisor, reconciliación y estados
packages/catalog/          manifiesto curado y transformaciones con créditos
supabase/
  migrations/              SQL ordenado, grants/RLS/RPC en el mismo cambio
  functions/               invitación y operaciones administrativas privilegiadas
  tests/                   pgTAP y pruebas de permisos
  seed.sql                 datos ficticios de dos cuentas y cinco alumnos
tests/fixtures/            v6, conflictos, rutinas, comandos y archivos válidos/rotos
tests/e2e/                 escenarios de usuario
scripts/                   importación, verificación de medios y respaldo
docs/ops/                  despliegue, incidentes, restauración y piloto
~~~

No crear packages/ui ni apps/mobile vacíos: componentes en web hasta que exista una necesidad compartida real. El dominio y sincronización no importan React ni APIs de DOM directamente.

## 3. Contratos compartidos

Los nombres siguientes son el contrato entre subplanes. No cambiarlos unilateralmente durante ejecución; actualizar productor, consumidores y pruebas en el mismo cambio.

~~~ts
type UUID = string;
type DateKey = string; // YYYY-MM-DD validado, no un instante
type Revision = number;
type AccountScope = { userId: UUID; workspaceId: UUID };
type SaveState = 'local-writing' | 'local-saved' | 'syncing'
  | 'synced' | 'conflict' | 'local-error' | 'auth-required';
type CommandKind = 'start_session' | 'adjust_prescription' | 'record_set'
  | 'skip_item' | 'finish_session' | 'correct_result'
  | 'mark_absent' | 'reschedule_visit' | 'save_draft'
  | 'publish_routine' | 'ensure_period' | 'reconcile_offline_session';
type CommandEnvelope = {
  schemaVersion: 1; operationId: UUID; deviceId: UUID;
  workspaceId: UUID; studentId: UUID; expectedRevision: Revision;
  capturedAt: string; kind: CommandKind; payload: unknown;
};
type CommandReply =
  | { status: 'applied' | 'duplicate'; operationId: UUID;
      revision: Revision; patch: StudentPatch }
  | { status: 'conflict'; revision: Revision; current: StudentSnapshot }
  | { status: 'rejected'; code: 'INVALID' | 'FORBIDDEN' | 'SESSION_CLOSED'
      | 'PERIOD_CHANGED' | 'ID_REUSED'; message: string };
~~~

StudentSnapshot: ficha del alumno, revisión, período/revisión vigente, visitas del rango descargado y sesiones abiertas con items/series. StudentPatch: upserts de esas mismas entidades, IDs archivados y nueva revisión. Ambos se validan en packages/domain/src/contracts.ts; nunca incluyen datos de otros alumnos ni credenciales. Consultas de historial son paginadas y no forman parte de cada respuesta de edición.

Payloads validados como unión discriminada por kind:

| Comando | Campos |
|---|---|
| start_session | sessionId, visitId opcional, periodId, routineRevisionId, dayId, week 1–4, date, time, timezone |
| adjust_prescription | sessionId, itemId o blockId, field permitido, value, scope=session_and_future o session_only |
| record_set | sessionId, itemId, setId, ordinal, state=pending/done/skipped, weight/reps/durationSec según tipo |
| skip_item | sessionId, itemId, skipped |
| finish_session | sessionId, quickConfirmItemIds, allowEmpty; rechazar pendientes inválidos |
| correct_result | sessionId, itemId, setId opcional, field, value, reason |
| mark_absent | visitId |
| reschedule_visit | visitId, newVisitId, date, time |
| save_draft | draftId, baseRoutineRevisionId, expectedDraftRevision, document |
| publish_routine | draftId, expectedDraftRevision, baseRoutineRevisionId, targetMonth |
| ensure_period | requestedMonth; servidor valida zona/período y condiciones |
| reconcile_offline_session | sessionId, originalPeriodId, originalRoutineRevisionId, date/time/timezone, resultados locales validados, reason; crea resultado histórico tras confirmación y nunca modifica el período nuevo |

raw input no cruza como número válido. Cliente admite coma y la normaliza; servidor acepta JSON numérico y valida rango. Identidad/autor se obtiene del token. El envelope no declara un actor confiable.

Interfaces de plataforma:

~~~ts
interface CloudGateway {
  fetchStudent(scope: AccountScope, studentId: UUID): Promise<StudentSnapshot>;
  execute(command: CommandEnvelope): Promise<CommandReply>;
}
interface LocalStore {
  stage(scope: AccountScope, draft: LocalCommand): Promise<void>;
  listPending(scope: AccountScope, studentId?: UUID): Promise<LocalCommand[]>;
  acknowledge(scope: AccountScope, reply: CommandReply): Promise<void>;
  purge(scope: AccountScope): Promise<void>;
}
~~~

LocalCommand: envelope antes de enviar, base de los campos afectados, secuencia local, estado queued/sending/conflict/rejected, intentos y rawInputs. La versión base del primer envío se congela junto al payload; acknowledge no borra ediciones posteriores. Un comando rechazado se conserva para revisión.

Al preparar el primer envío de comandos sucesivos de la misma cola, expectedRevision se calcula con el último ACK del propio flujo y se comprueba que los campos base aún coinciden. Después queda congelado. Un cambio remoto exige reconciliación; no se acepta cambiando únicamente expectedRevision. Conflicto es un resultado de dominio tipado: el adaptador puede mapearlo a HTTP 409; no depender del código HTTP genérico de PostgREST para identificarlo.

Las RPC administrativas create_student/update_student/archive_student, las de plantilla y las de catálogo son online en este MVP. Usan expectedRevision/operationId y el mismo helper de recibos cuando mutan datos auditables; las de alumno bloquean su fila, las de plantilla/catálogo su entidad. Ninguna escritura administrativa sube toda la instantánea ni evita el control de revisión.

Gateway web invoca RPC apply_training_command(command jsonb). Cada comando confirmado se ejecuta como una transacción; no como tres solicitudes HTTP independientes. Mantener una única cola de escrituras.

## 4. Dependencias y cortes

~~~mermaid
flowchart LR
  A[A: cuentas y plataforma] --> B[B: alumnos y programación]
  B --> C[C: entrenamiento y sincronización]
  A --> D[D: migración y operación]
  B --> D
  C --> D
  D --> P[Piloto 1 entrenador]
  P --> F[Ampliar a 5]
  F --> N[Evaluación Android/iOS]
~~~

| Subplan | Estimación propia | Entregable |
|---|---|---|
| [A](2026-10-03-mvp-a-plataforma.md) | 7–10 jornadas | Cuenta, aislamiento y entorno verificable |
| [B](2026-10-03-mvp-b-programacion.md) | 9–14 jornadas | Programación y agenda productivas |
| [C](2026-10-03-mvp-c-entrenamiento.md) | 13–21 jornadas | Sesión móvil, auditoría y sincronización |
| [D](2026-10-03-mvp-d-piloto.md) | 6–10 jornadas | Migración, recuperación y piloto seguro |
| Total | 35–55 jornadas + observación del piloto | MVP web, no publicación en tiendas |

Los valores estiman trabajo de una persona con experiencia, incluyendo pruebas. Falta medir complejidad de contenido y dispositivos reales; no convertirlos en fechas comprometidas. No delegar tareas automáticamente por esta tabla.

## 5. Estrategia común de pruebas y commits

En cada tarea: escribir un caso concreto de la aceptación indicada, comprobar que falla por comportamiento ausente, implementar, ejecutar ese caso y el conjunto afectado, revisar diff y guardar un commit. No escribir pruebas tautológicas de estilos. Contratos, autorización, idempotencia y recuperación necesitan pruebas de integración.

Scripts que A1 debe definir:

~~~json
{
  "test:unit": "vitest run",
  "test:e2e": "playwright test",
  "test:db": "supabase test db",
  "typecheck": "tsc --build --pretty false",
  "build": "npm run build --workspace apps/web"
}
~~~

Configurar workspaces, Vitest y TypeScript para que esos comandos existan realmente. Usar npm ci en CI. `supabase start` requiere Docker; instalar herramientas solamente al ejecutar y si el entorno lo necesita. Semillas contienen datos ficticios y cuentas de prueba locales, nunca claves productivas en Git.

Pruebas e2e se ejecutan contra Supabase local/staging, no contra producción. El helper tests/fixtures/cloud.ts debe crear y limpiar espacios de prueba identificados; fuera de esos IDs no borra nada. Las funciones createAccountFixture, seedStudentRoutine y dropFixture se implementan con Admin API del entorno de prueba y se bloquean si el host apunta a producción.

## 6. Definición de terminado

Un corte está terminado si su demo funciona, contratos y pruebas pasan, errores se ven en UI, accesibilidad básica funciona y README explica cómo reproducirlo. C y D requieren pruebas desde conexiones nuevas, no solo un estado React optimista.

El MVP solo está listo para datos reales cuando D documenta: versión desplegada, fecha, dispositivos, evidencia RLS/RPC, simulaciones offline, backup restaurado, costos/alertas configurados y fallos pendientes. Un hallazgo de pérdida de datos o acceso cruzado bloquea la liberación.

## 7. Cobertura y revisión del plan

| Sección de diseño | Tareas |
|---|---|
| Usuarios, login y aislamiento | A2–A4 |
| UI móvil/escritorio | A1, B2–B4, C3 |
| Reglas de valores/series/historial | B1, C1, C3, C5 |
| Rutinas por mes | B3–B4, C4 |
| Modelo y contratos | A3, B1, C1 |
| Cola, offline, conflictos | C2–C4 |
| Biblioteca y licencias | B2 |
| Gráficos | C5 |
| Migración v6 | D1 |
| Backup, costos, privacidad y operación | A4, D2–D4 |
| Ruta Android/iOS | D4 define el corte posterior |

Autorrevisión: diseño distingue acuerdos de propuestas; no hay altas externas ejecutadas; todos los requisitos MVP tienen tarea; el detalle nativo es una fase posterior con criterios de entrada. La revisión final técnica se realiza al implementar, especialmente sobre SQL de autorización y sincronización.
