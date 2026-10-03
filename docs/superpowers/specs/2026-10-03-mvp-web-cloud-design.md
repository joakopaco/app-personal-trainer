# Pulso — diseño del MVP web con cuentas y datos compartidos entre dispositivos

Fecha: 03/10/2026. Estado: propuesta completa para revisión; no autoriza por sí misma despliegues, contratación ni desarrollo.

## 1. Acuerdos y criterio de éxito

Confirmado por el usuario:

- Solo los entrenadores tienen login; los alumnos son fichas administradas por ellos.
- Cada entrenador tiene su espacio y sus propios alumnos.
- El piloto empieza con un entrenador; como máximo cinco inicialmente.
- Web primero, uso cotidiano prioritario en celular; computadora para administrar y crear rutinas.
- Vercel y Supabase para el MVP; Android e iOS como destino posterior.
- Se conserva el seguimiento simultáneo, edición durante el entrenamiento, historial, bloques, descansos, faltas y continuidad mensual.

El número de alumnos por entrenador y presupuesto mensual no fueron especificados. Para dimensionar pruebas se propone **100 alumnos por entrenador, 500 en total y cinco sesiones activas por entrenador**. Son cargas de prueba, no límites comerciales. Para probar concurrencia: 25 sesiones abiertas en cinco cuentas y dos dispositivos por entrenador.

Éxito: el entrenador puede atender a cinco alumnos, alternar con una mano, consultar el último valor, anotar un cambio y continuar; los datos confirmados aparecen en computadora, los pendientes sobreviven una recarga y los conflictos se muestran sin sobrescritura silenciosa.

## 2. Alcance por prioridad

| Prioridad | Incluido |
|---|---|
| MVP obligatorio | Login/recuperación, espacio privado, alumnos, agenda, faltas/reprogramación/llegadas, biblioteca inicial, rutinas mensuales con bloques, sesiones simultáneas, edición directa, guardado local + remoto, auditoría, historial, progreso básico, respaldo/restauración operativa, exportación y despliegue |
| MVP recomendado | Detalle opcional por serie, pesos decimales, temporizador por alumno, referencia de sesión anterior, ilustraciones bajo demanda, impresión de rutina, búsqueda por músculos/equipo |
| Después del piloto | Tema oscuro, importadores Strong/Hevy, RPE/RIR, asistencia con recordatorios, sustituciones avanzadas durante sesión, reportes más completos |
| Otra fase | App Android/iOS publicada, equipos de entrenadores, login de alumnos, pagos, chat, IA, nutrición, fotos corporales, wearables/HealthKit/Health Connect |

Las funciones recomendadas forman parte de la estimación propuesta; se pueden recortar antes de ejecutar, pero no se elimina la integridad, aislamiento o recuperación para ganar tiempo.

## 3. Arquitectura elegida y alternativas

| Ruta | Beneficio | Coste/riesgo | Decisión |
|---|---|---|---|
| React + TypeScript + Vite, PWA, luego Capacitor | Una interfaz web adaptable, bundle reutilizable y backend independiente | WebView requiere pruebas nativas; segundo plano y almacenamiento necesitan adaptadores | Recomendada para web primero |
| Next.js web + Expo/React Native móvil | Interfaz específica por plataforma; buena ruta cuando se prioriza experiencia nativa | Dos interfaces; compartir tipos no evita rehacer componentes web | Alternativa si el piloto exige capacidades nativas profundas |
| Expo universal desde el inicio | Lógica y parte de interfaz comunes | Editor denso de escritorio, PWA y componentes web deben validarse temprano | No recomendada para este MVP administrativo |

Vercel alojará el frontend compilado; Supabase proveerá Auth, Postgres, Storage y Realtime. Vercel no será la base de datos ni el disco persistente. No se necesita SSR para una herramienta privada. Las funciones privilegiadas puntuales se alojarán en Supabase Edge Functions; los comandos transaccionales, en funciones Postgres. No repartir la misma regla de negocio entre dos backends.

Capacitor copia el bundle web a proyectos Android/iOS, pero la compilación, firma y pruebas siguen siendo específicas. [Documentación](https://capacitorjs.com/docs/basics/workflow). La alternativa Expo es una decisión posterior, no una conversión automática garantizada.

~~~mermaid
flowchart LR
  M[Celular: PWA] --> UI[React y dominio TypeScript]
  D[Computadora: administración] --> UI
  UI --> L[IndexedDB: vista local y cola durable]
  L --> S[Sincronizador por alumno]
  S --> A[Supabase Auth]
  S --> RPC[Comandos Postgres autorizados]
  RPC --> DB[(Postgres: datos e historial)]
  DB --> RT[Realtime: aviso de nueva revisión]
  RT --> S
  UI --> ST[Storage: biblioteca y medios propios]
  V[Vercel: frontend] --> UI
  DB --> B[Respaldos y restauración ensayada]
  ST --> B
~~~

Bibliotecas propuestas: React/TypeScript/Vite, router web, Dexie para IndexedDB, cliente Supabase, validación de contratos y un componente de gráficos accesible. Elegir versiones estables compatibles y fijarlas en lockfile al comenzar; no usar rangos flotantes ni instalar dependencias en esta etapa. TanStack Query, si se incorpora, maneja consultas; la cola durable de comandos mantiene una sola autoridad de escritura.

## 4. Experiencia en celular y escritorio

### Celular: atender

Pantalla Hoy con alumnos en curso primero, pendientes por hora y acciones «Agregar ahora», «No asistió», «Reprogramar». Una falta queda registrada aunque nunca se reprograme. Una visita extraordinaria no altera el horario recurrente.

Al abrir una sesión:

1. Nombre visible siempre; selector compacto de alumnos activos, con aviso si alguno tiene cambios pendientes.
2. Bloques plegables; recordar bloque, fila y desplazamiento por sesión.
3. Ejercicio + resultado anterior + campos grandes. Teclado decimal para peso, entero para repeticiones; aceptar coma o punto decimal.
4. Peso/repeticiones editables inline. Series y descansos en una segunda fila cuando el ancho lo requiera. No reducir todo a una tabla ilegible.
5. «Detalle de series» permite anotar diferencias sin obligar a registrar cada serie por separado.
6. Temporizador independiente por alumno, con nombre, tipo de pausa, pausar y +15 s. No alertar cinco temporizadores con sonido por defecto.
7. Cierre explícito con resumen de realizados/omitidos/pendientes.

Objetivos de interacción propuestos: abrir un alumno activo con un toque; iniciar una llegada no agendada en no más de tres decisiones; modificar peso sin modal; controles de al menos 44 × 44 CSS px, tipografía de campos de 16 px o más. No gestos ocultos como única forma de actuar. Nombre y estado acompañan los colores. Probar teclado abierto, safe areas, zoom y lector de pantalla.

### Computadora: preparar y revisar

Biblioteca buscable a la izquierda, bloques/días/semanas en el centro y resumen de volumen planificado a la derecha. Copiar día, bloque o semana; mover con arrastre y botones equivalentes. Guardar borrador y activar son acciones distintas. Comparar borrador con rutina vigente antes de reemplazar. Revisar historial, asistencia, notas y progresos desde la ficha.

La misma cuenta puede editar desde cualquiera de las vistas; el diseño cambia por espacio disponible, no por permisos.

## 5. Valores, series e historial: reglas de producto

Separar **prescripción**, **ejecución** e **historial de modificaciones**.

- La prescripción contiene los objetivos de una rutina; una sesión conserva una copia inicial.
- En modo rápido, cambiar peso/reps/series actualiza los valores de sesión y la rutina desde la semana elegida, manteniendo el comportamiento solicitado. La interfaz lo indica junto a los campos.
- En detalle por serie, anotar una ejecución particular solo modifica esa serie. «Usar para próximas sesiones» permite promoverla expresamente a la prescripción.
- Una serie ya confirmada nunca cambia por editar después la prescripción. Solo una corrección expresa la modifica y registra antes/después.
- Reducir la cantidad de series solo elimina posiciones todavía pendientes; si hay más series confirmadas que el nuevo objetivo, se conserva la ejecución y se solicita revisar el objetivo. No borrar resultados para hacerlos encajar.
- «Finalizar» muestra cuántas series tienen ejecución individual y cuántos ejercicios se confirmarán en modo rápido. Los resultados rápidos llevan origen quick_confirmed; no inventar que fueron observados uno a uno.
- Todo ejercicio se puede omitir; los omitidos no contribuyen al volumen. Cerrar una sesión vacía exige confirmación y se registra como sin ejercicios, no como progreso.
- Una persona tiene una sola sesión abierta confirmada; puede tener varias finalizadas el mismo día.
- Corregir un resultado finalizado requiere motivo y no reabre la sesión ni altera automáticamente la rutina.
- Las plantillas son independientes de sus copias asignadas.

Rangos propuestos para reemplazar las restricciones de la demo: peso 0–1000 kg con dos decimales; series 1–50; repeticiones 1–500; duración 1–86400 s; descansos 0–3600 s o sin definir. Son validaciones técnicas, no recomendaciones físicas. Avisar ante saltos inusuales sin prohibir una carga válida. Inicio en kg, sin conversión a lb en el MVP. El cero significa cero; vacío significa sin definir y bloquea la confirmación si el tipo de ejercicio lo exige.

Tipos iniciales: carga + repeticiones, solo repeticiones y duración. No forzar peso en una plancha ni inventar tonelaje para trabajo por tiempo. Conservar si la carga es total o por implemento en la definición del ejercicio y compararla bajo la misma convención.

## 6. Rutinas por mes y concurrencia

Un período mensual identifica alumno + mes calendario, con revisiones inmutables de su contenido y un puntero a la vigente. Cuatro variantes semanales iniciales; días 29–31 usan la cuarta como valor sugerido y el entrenador puede cambiarla.

Al acceder o iniciar una sesión en un mes nuevo, una operación idempotente asegura el período. Si hay sesión confirmada abierta, se pospone la continuidad. Al cerrarla, se continúa con la última revisión. Si se activó otra rutina para el nuevo período, no se reemplaza. No se crean entrenamientos ni meses ficticios durante un período de inactividad.

El servidor usa zona horaria del espacio, inicialmente America/Argentina/Buenos_Aires. Instantes en UTC; fecha de entrenamiento y zona conservadas por separado. Una sesión offline mantiene su fecha capturada, aunque sincronice al día siguiente.

Una sesión iniciada offline desde un período viejo puede encontrar una rutina nueva al volver. Se conserva como pendiente con su snapshot y se pide reconciliar: importarla como ejecución del período original sin propagar cambios a la rutina nueva, o descartarla explícitamente. El servidor no puede conocer sesiones que otro dispositivo todavía no envió.

Activar un borrador comprueba revisión base y sesiones abiertas dentro de la transacción. Un ajuste en vivo ocurrido después de crear el borrador debe compararse antes de activar; no basta con que la pantalla haya pasado esa validación unos segundos antes.

## 7. Modelo de datos

Propuesta de tablas, no migraciones ejecutadas:

| Entidad | Responsabilidad e invariantes |
|---|---|
| profiles | Preferencias del entrenador; ID ligado a Auth |
| workspaces | Un espacio por entrenador; owner_user_id único, nombre, zona |
| students | Ficha privada, estado activo/archivado, revisión para serializar comandos |
| schedule_rules, visits | Horarios recurrentes y ocurrencias/excepciones; vínculos de reprogramación |
| exercises, exercise_media | Catálogo global o propio; tipo, equipo, músculos, origen y licencia |
| routine_templates | Documento de plantilla con revisión y dueño |
| routine_periods | Único por alumno/mes; revisión vigente y período de origen |
| routine_revisions | Documento versionado inmutable de cuatro semanas, días, bloques y posiciones |
| routine_drafts | Documento editable, revisión local de guardado y revisión de origen |
| sessions | Estado, visita, período, snapshot inicial, inicio/cierre y dispositivo |
| session_items | Posición de ejercicio/bloque y valores actuales; identidad independiente del catálogo |
| session_sets | Series individuales o confirmadas en modo rápido; tipo/origen/estado |
| audit_events | Actor, operación, entidad, campo, antes/después, motivo, hora de servidor y hora de captura |
| operation_receipts | operation_id, autor, hash del comando, resultado y revisión asignada |
| import_jobs | Hash de archivo, mapa de IDs, conteos, validación y resultado de importación |

Se usa JSONB para documentos de rutina y snapshots, no para almacenar toda la aplicación en una única fila. Validación estructural del documento tanto en cliente como en servidor. Sesiones, resultados y acceso se modelan relacionalmente para poder consultar y asegurar.

Todas las entidades privadas llevan workspace_id. Las referencias privadas usan claves compuestas que impiden asociar un alumno de otro espacio incluso con IDs conocidos. Índices: espacio/alumno, visitas por fecha, sesiones por alumno/estado, resultados por ejercicio/fecha. Índice único parcial de sesión abierta por alumno; período único por alumno/mes; operation_id único por espacio. Campos de auditoría sin permisos directos de UPDATE/DELETE para usuarios.

El ejercicio de catálogo, su posición en rutina y su posición en sesión son IDs distintos. Los documentos conservan lineage_id entre semanas para propagar al destino correcto; copiar a otro alumno genera nuevas identidades.

## 8. Contrato de guardado y sincronización

### Lo que verá el entrenador

| Estado | Significado |
|---|---|
| Guardando en este dispositivo | Aún no se confirmó la escritura local |
| Guardado en este dispositivo · pendiente de sincronizar | Cola y cambio local persistidos; aún no confirmados por servidor |
| Sincronizado | El servidor confirmó operación, datos e historial |
| Revisar cambio | Otra versión impide aplicar sin decisión |
| No se pudo guardar | Falló el almacenamiento local; el valor sigue solo en memoria |

Nunca mostrar «Sincronizado» por tener internet o recibir un evento Realtime.

### Escritura

1. Validar entrada; conservar texto transitorio separado del número válido.
2. Guardar proyección local + comando con UUID en una transacción IndexedDB. Agrupar el tecleo por campo durante 300 ms; persistir también el texto pendiente para recuperarlo tras recarga. No llamar a cada tecla “cambio de peso confirmado”.
3. Cola FIFO por alumno: bloquea operaciones dependientes de ese alumno, permite continuar otros. Un solo emisor por cuenta/dispositivo entre pestañas; la idempotencia del servidor protege también contra un emisor duplicado.
4. Enviar comando con expected_revision, operation_id, captured_at, device_id y alcance. Una operación enviada no cambia de payload; una edición posterior es otra operación.
5. El servidor verifica identidad/membresía, hash e idempotencia; bloquea el alumno, compara revisión, valida comando y modifica sesión, rutina y auditoría en la misma transacción.
6. Responder con revisión y datos canónicos. Confirmar localmente y retirar de la cola dentro de otra transacción.
7. Si se pierde la respuesta después del commit, reintentar el mismo ID devuelve el recibo original, sin duplicar.

Las operaciones no se aceptan por orden de reloj del celular. Si el ID ya existe con otro contenido, se rechaza. Conservar recibos durante la vida de los datos a este tamaño de piloto; si se compactan después, mantener deduplicación demostrable.

### Conflictos

Revisión por alumno evita que editar a una persona bloquee a todas. Un resultado conflict (equivalente a 409 en un adaptador HTTP) detiene su cola, preserva la base y muestra valor remoto/local, campo, alumno y fecha. Aplicar usa un nuevo ID sobre la revisión actual; descartar conserva la versión remota. Los comandos posteriores dependientes se reconstruyen con comparación de tres versiones; si no son compatibles se mantienen pendientes. No reintentar ciegamente una cola antigua cambiándole solo el número de revisión.

Realtime avisa que hay novedades; el cliente consulta de nuevo mediante permisos. Al iniciar, recuperar foco o reconectar, consulta revisiones aunque se haya perdido el aviso. No reemplaza campos con escritura local pendiente. [Realtime](https://supabase.com/docs/guides/realtime/postgres-changes).

### Offline acotado

Login inicial y descarga del contexto requieren conexión. Disponible sin red: alumnos/rutinas previamente preparados, iniciar sesión provisional, editar, marcar series y solicitar cierre. Altas de cuenta, biblioteca remota, publicación de rutina y cambios administrativos sensibles requieren conexión en esta versión.

El cierre offline queda «Finalización pendiente» y bloquea otra sesión local del mismo alumno hasta confirmar. Los resultados pendientes pueden verse identificados, pero no entran al progreso confirmado. El flujo debe recuperarse tras matar/reabrir el navegador.

La caché está separada por usuario y espacio. Al expirar sesión, se pausa el envío y se pide reautenticar la misma cuenta; nunca se envían pendientes con la siguiente cuenta que ingrese. En dispositivo personal con sesión previamente validada, se permite trabajo local por hasta 24 horas sin verificación remota, como política propuesta. Después se bloquea edición hasta reconectar. No permite revocación instantánea mientras está offline.

Cerrar sesión con pendientes ofrece sincronizar, cancelar o exportar antes de un descarte explícito. Tras cierre normal, limpiar caché privada, tokens y vistas. IndexedDB no se describe como cifrado ni como respaldo externo. Detectar cuota/evicción; no depender de Background Sync, de beforeunload ni de un temporizador ejecutándose en segundo plano. [Limitación de Background Sync](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API).

## 9. Login, acceso y seguridad

MVP con email/contraseña, verificación de email y recuperación. Alta por invitación para el piloto. Contraseñas gestionadas por Supabase Auth; no se almacenan en tablas propias. SMTP de producción, dominio verificado y redirects exactos de cada entorno. Mensajes de acceso sin revelar si un email está registrado. [Auth](https://supabase.com/docs/guides/auth/passwords), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

RLS en tablas expuestas y políticas de archivos; sin datos privados para anon. El frontend solo contiene URL y clave pública de Supabase; service-role, correo y secretos quedan del lado servidor. El ID del dueño se deriva de auth.uid(), nunca de un parámetro confiado al navegador. Consultas/vistas de gráficos también deben respetar aislamiento. [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage](https://supabase.com/docs/guides/storage/security/access-control).

Escrituras críticas solo por funciones autorizadas, sin ruta directa que evite auditoría. Si una función usa SECURITY DEFINER, fijar search_path, revocar ejecución pública y comprobar dueño de cada entidad antes de escribir. Verificar el JWT en Edge Functions que usen privilegios; pertenencia validada de nuevo en DB.

Fichas con datos mínimos y notas privadas; no incorporar documentos clínicos, DNI o fotos corporales al MVP. Sin analítica que capture pesos, notas, formularios, contraseñas o tokens. CSP y escape de contenido; SVG externo solo tras saneado/build, nunca HTML no confiable inline.

Archivar alumno conserva historial y permite restaurar. Eliminar datos personales/cuenta es un flujo separado, autenticado y auditado, con confirmación, purga de objetos/cachés y tratamiento documentado de respaldos. Responsable del piloto define aviso de privacidad, plazos de retención y canal para solicitudes antes de datos reales; este documento no pretende resolver obligaciones legales de una jurisdicción.

## 10. Biblioteca y medios

Catálogo inicial curado de 100–150 ejercicios frecuentes, sujeto a revisión del entrenador; más útil que importar mil duplicados. Nombres y alias en español, equipo, músculos principales/secundarios, tipo de registro, instrucciones y medio opcional.

Workout Guide es candidato principal de ilustraciones animables; la licencia de arte se gestiona aparte del software. [Licencias](https://github.com/bryllim/workout-guide/blob/main/LICENSES.md). Selección y atribución detalladas en el [informe de investigación](../../research/2026-10-03-referencias-producto.md).

Media con poster, reproducción/pausa y reduced-motion. Cargar al abrir el detalle; no reproducir decenas de animaciones durante la clase. Si no hay red o medio, el registro sigue funcionando. Catálogo global distribuido como recursos versionados; ejercicios propios en Storage privado. Límites iniciales propuestos: imagen 5 MB, video MP4 20 MB, duración 30 s; validar MIME/contenido y no admitir enlaces que el servidor descargue arbitrariamente.

Créditos por recurso: autor, URL de origen, licencia, versión/hash y modificaciones. No hacer hotlink al GitHub de terceros como servicio de producción. Copias de medios aprobados en almacenamiento controlado por el proyecto.

## 11. Gráficos y métricas

Tres vistas MVP:

- Asistencia: realizadas/faltas/reprogramadas por mes. Las visitas espontáneas no aumentan artificialmente el porcentaje de cumplimiento del horario; mostrar conteos aparte.
- Progreso por ejercicio: mejor carga con repeticiones asociadas, series realizadas y evolución del volumen, con tabla de datos y filtro temporal.
- Distribución por músculos: series de trabajo confirmadas; músculos principales en el total y secundarios en otra capa explicada, evitando doble conteo.

Volumen = suma de carga × reps de series confirmadas elegibles. Excluir omitidas, calentamiento y ejercicios por tiempo; para peso corporal sin carga externa mostrar reps/series, no tonelaje ficticio. Un dato legacy agregado mantiene esa etiqueta. No convertir una falta de registro en cero ni interpolar como hecho.

La estimación de 1RM y la fatiga quedan fuera del MVP; necesitan reglas y límites específicos. El mapa corporal actual se puede conservar como navegación y distribución, no como diagnóstico. Correcciones refrescan agregados y guardan auditoría.

## 12. Migración desde la demo

Base inspeccionada: rama codex/entrenamiento-en-vivo, commit bd3b15e. Hay lógica pura aprovechable en training-domain.js, training-schema.js, training-months.js y regresiones; la UI usa scripts globales y la persistencia escribe una instantánea completa. No es aún una arquitectura multiusuario.

Conservar reglas y casos de prueba; portar a módulos TypeScript y componentes. No añadir una llamada remota a persist() que suba todo DB. Mantener demo separada y ejecutable mientras se alcanza paridad.

Importador explícito de backup v6 con vista previa, conteos y copia original. Mapear IDs a UUID por trabajo de importación; identidad compuesta para posiciones repetidas en semanas. Distinguir datos de ejemplo de reales y no subir la demo automáticamente al crear una cuenta. Fuente local se mantiene intacta.

Los registros agregados antiguos no acreditan ejecución individual por serie. Importarlos con su formato y origen, sin fabricar eventos, horas o series observadas. Importación transaccional, idempotente por hash + espacio; un archivo inválido no deja registros parciales. No reemplazar toda una cuenta mediante un JSON del navegador.

## 13. Operación, costos y respaldos

Entornos: local con Supabase CLI/Docker; staging con datos ficticios; producción separada. Previews Vercel nunca apuntan a producción. Migraciones SQL en Git; CI valida antes de aplicar; rollback de frontend no deshace migraciones de DB. Usar cambios compatibles entre versión anterior y nueva.

Referencia de costos consultada al 03/10/2026: Supabase Pro desde USD 25/mes y Vercel Pro desde USD 20/mes. Base orientativa USD 45/mes para un proyecto/una plaza de desarrollo, más cómputo de entornos adicionales, dominio, correo, almacenamiento, tráfico, impuestos y extras. No es una cotización ni gasto autorizado. Vercel Hobby se limita a uso personal no comercial; no presupuestar producción comercial en Hobby. [Supabase](https://supabase.com/pricing), [Vercel](https://vercel.com/pricing), [Hobby](https://vercel.com/docs/plans/hobby).

Para datos reales, proponer Pro más copia externa diaria cifrada y retención de 30 días, con control de acceso y alerta de fallo. Objetivos iniciales a aprobar: pérdida recuperable máxima de 24 h ante desastre del servidor y recuperación en 4 h tras iniciar el procedimiento. Son objetivos que se miden en ensayo, no garantías actuales. Si 24 h no es aceptable, definir PITR y presupuesto antes del piloto.

Supabase documenta backups diarios en planes pagos y que **los objetos de Storage no están incluidos**. Respaldar también medios privados, manifiestos y configuración necesaria. Ensayar restauración de base, acceso y objetos en destino aislado; comparar conteos, hashes y permisos. [Backups](https://supabase.com/docs/guides/platform/backups).

Observabilidad: errores por operación/versión sin contenido sensible; edad de cola pendiente, conflictos, tiempos de confirmación, fallos de Auth/backup, espacio y tráfico. Aviso visible al entrenador ante datos sin sincronizar; aviso operativo si falla el respaldo o hay errores repetidos. No registrar cada tecla en telemetría.

## 14. Salida a piloto y camino móvil

Requisitos de liberación:

1. Dos cuentas no pueden leer ni modificar datos cruzados, incluso con llamadas directas.
2. Cinco sesiones mantienen valores correctos al alternar; 25 concurrentes entre cinco entrenadores no se mezclan.
3. Cortar red, recargar y reconectar conserva comandos durables, aplica una sola vez y recupera el cierre.
4. Commit remoto exitoso con respuesta perdida no duplica resultados.
5. Conflictos entre dos dispositivos se resuelven explícitamente; rutina/borrador/mes no sobrescriben historia.
6. Restauración demostrada de DB y un archivo; objetivos de recuperación medidos.
7. Android Chrome e iPhone Safari/PWA en dispositivos reales, escritorio y tablet. Emulación no sustituye la prueba real.
8. Una semana de uso acompañado con un entrenador, sin pérdida confirmada ni incidencias de acceso; luego ampliar a cinco.

Presupuestos de rendimiento propuestos: reacción visual al tecleo <100 ms, cambio entre alumnos precargados <200 ms p95, confirmación remota <2 s p95 en red normal del piloto, pantalla Hoy <2,5 s en dispositivo de referencia. Medir, no prometer antes del ensayo.

Después del piloto: prueba técnica Capacitor con login, teclado, caché, recuperación, deep links y temporizadores; Android firmado, iOS con entorno macOS/Xcode o servicio de build compatible; TestFlight/Play testing y luego revisión de tiendas. Las cuentas, base y comandos no cambian. [Capacitor iOS](https://capacitorjs.com/docs/ios), [Apple review](https://developer.apple.com/app-store/review/guidelines/).

No se presume aprobación de tiendas por envolver una web. Si las pruebas muestran límites importantes, conservar backend/contratos y desarrollar interfaz Expo; estimar ese trabajo antes de decidir.

## 15. Decisiones propuestas para revisar

Confirmadas: usuarios entrenadores, espacios individuales, piloto 1 → 5, web primero, proveedores.

Propuestas explícitas: React/Vite/PWA → Capacitor; detalle opcional por serie; ampliación de rangos; offline acotado; piloto comercial con planes pagos; RPO 24 h/RTO 4 h; catálogo inicial curado. Presupuesto y cantidad de alumnos reales siguen sin especificar y se validan antes de contratar/dimensionar producción.

La investigación y el plan se entregan completos en esta etapa. La siguiente acción será revisar estas propuestas y comenzar por el primer corte del plan, cuando el usuario pida desarrollar.
