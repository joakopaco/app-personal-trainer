> **Actualización 2026-10-03:** Pulso está publicado en https://app-personal-trainer-one.vercel.app, con Supabase cloud y Turnstile. El piloto usa email y contraseña; verificación y recuperación por correo se posponen por decisión del producto. No se debe confundir la confirmación automática con validar la titularidad del email. El entorno local mantiene Mailpit para probar el flujo futuro.

# Pulso · Herramienta para personal trainers

Aplicación web implementada con React/TypeScript, Supabase Auth/Postgres y cola local en IndexedDB. El uso diario prioriza celular; la computadora permite preparar rutinas, plantillas y revisar progreso. En personal trainer, cada entrenador tiene una cuenta y sus alumnos son fichas privadas. La modalidad gimnasio agrega cuentas administradas de gimnasio y entrenado; ver [operación de gimnasio](docs/ops/gym-accounts.md).

## Ejecutar la app nueva en local

```text
npm ci
npm run db:start
npm run local:setup
npm run dev
```

Requiere Node 24 y Docker Desktop. Abrir **http://127.0.0.1:5173**. Las dos cuentas ficticias están en `.local/accounts.json` (archivo privado, ignorado por Git). `local:setup` rota sus contraseñas si se repite. La nueva app no importa la demo automáticamente.

- Hoy: agenda, inasistencia sin reprogramar, cancelación y entrenamiento espontáneo; acceso rápido a alumnos entrenando.
- Entrenamiento: series visibles con peso, repeticiones y confirmación por fila; ajustes del ejercicio, descansos legibles, temporizador compacto, corrección con motivo y cierre explícito. Varios alumnos mantienen sus valores independientes.
- Rutinas: cuatro semanas, días de la agenda del alumno, plantillas de hasta seis días y copia a semanas elegidas. Series de 1–4, repeticiones de 4/6/8/10/12 y descansos de 30/60/180/300 segundos. Progresión opcional con peso y repeticiones por serie; descanso macro exclusivamente de bloque. Los valores antiguos se conservan. Borradores incompletos, publicación versionada y comparación de cambios mantienen separada la rutina vigente.
- Biblioteca: catálogo en español organizado por grupo muscular, búsqueda, favoritos y ejercicios propios. Sin imágenes ni animaciones por decisión del producto.
- Historial: resultados cerrados, valores anteriores/nuevos, filtros, volumen, series por músculo y CSV. Los registros v6 se conservan como agregados antiguos.
- Ajustes: perfil, edición de nombre y cambio de contraseña actual. Email de solo lectura hasta habilitar correo verificado.
- Guardado y recuperación: estados locales y de servidor diferenciados, reintentos idempotentes, recuperación de conflictos dentro del flujo y borradores recuperables entre pestañas. La navegación protege cambios que todavía no pudieron guardarse; se puede descargar una copia de recuperación. La actualización de la PWA espera un punto sin pendientes.

**Guardado:** primero se confirma una transacción local; después la app indica sincronización cuando el servidor confirma. Recargar offline conserva los comandos ya guardados. La caché no reemplaza un backup: borrar datos del navegador puede perder cambios que todavía no llegaron al servidor. El acceso offline requiere preparación previa y se limita a 24 h desde la verificación.

## Verificar

```text
npm run typecheck
npm test
npm run test:db
npm run test:e2e
npm run build
npm run test:pwa
npm run backup:local
npm run restore:check
```

E2E requiere la instancia local y las cuentas generadas; utiliza datos ficticios y limpia sus fixtures. La prueba de carga crea temporalmente 500 alumnos y 25 sesiones. El ensayo de recuperación usa un destino aislado. No ejecutar pruebas destructivas contra un proyecto real.

## Estado y operación

[Verificación del MVP](docs/verification-mvp.md) distingue evidencia local y pendientes externos. [Despliegue](docs/ops/deploy.md), [respaldo y restauración](docs/ops/backup-restore.md), [incidentes](docs/ops/incident-response.md), [privacidad](docs/ops/privacy.md), [piloto](docs/ops/pilot.md) y [Android/iOS](docs/mobile-readiness.md).

El piloto está publicado en Vercel y conectado a Supabase cloud. Docker se usa exclusivamente para pruebas locales con datos ficticios; no es una dependencia de la app publicada. SMTP real, respaldos externos, dispositivos físicos y la semana de piloto conservan sus verificaciones operativas pendientes. No se debe confundir una batería local aprobada con recuperación productiva garantizada.

Arquitectura: `apps/web` contiene la interfaz y adaptadores; `packages/domain` las reglas/contratos; `packages/sync` la persistencia/cola; `supabase/migrations` el esquema y las operaciones autorizadas. [Plan original](docs/PLAN-MVP.md) y [decisiones de implementación](docs/implementation-decisions.md).

## Demo histórica v6 (se conserva aparte)

La documentación que sigue describe exclusivamente la demo anterior, servida desde la raíz con `python -m http.server 4175 --bind 127.0.0.1`. No describe la persistencia del MVP nuevo.

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
