# Pulso — investigación de producto y reutilización

Fecha de consulta: 3 de octubre de 2026. Objetivo: diseñar una herramienta para entrenadores que atienden varias personas, con uso principal en celular y preparación en computadora.

Este documento distingue funciones declaradas por sus autores, código inspeccionado y propuestas propias. No se ejecutaron ni auditaron íntegramente los proyectos externos. No se importó código, contenido ni medios de terceros a la aplicación.

## 1. Referencias seleccionadas

| Referencia | Evidencia consultada | Qué adoptar en Pulso | Qué no trasladar al MVP |
|---|---|---|---|
| [GymMane](https://github.com/InlitX/GymMane) | README, modelo de sesión y servicio de actividad en vivo | Valores accesibles durante la sesión, recuperación de contexto, descansos ligados a cada sesión | Diseño alrededor de un único deportista; funciones sociales, IA y widgets |
| [openGym](https://opengym.duarte-santos.ch/) | Web, capturas oficiales y módulos de sincronización | Separar agenda de rutina, mostrar valores previos, mapas/calendarios comprensibles, detectar versiones obsoletas | Fatiga como indicador supuestamente clínico; mezclar documentos completos por fecha del dispositivo |
| [Workout Guide](https://github.com/bryllim/workout-guide) | Manifiesto de 302 ejercicios y licencias separadas | Fuente candidata de ilustraciones animables, con identidad, músculos, equipo y atribución por recurso | Asumir que todo son GIF o que MIT cubre las imágenes |
| [Strong](https://www.strong.app/) | Funciones oficiales | Registro compacto, historial por ejercicio, temporizadores y exportación | Imágenes, marca o código propietario; funcionalidades no verificadas detrás de login |
| [Hevy Coach](https://hevycoach.com/personal-trainer/) | Descripción y pantallas oficiales del flujo del entrenador | Constructor de programas en escritorio y registro presencial desde móvil, comparación con sesión previa | Exigir una cuenta del alumno; mensajería y ecosistema social |
| [Trainerize](https://www.trainerize.com/features/) | Catálogo oficial de funciones | Separación entre programar, acompañar y administrar | Nutrición, cobros, video coaching y generación con IA en la primera entrega |
| [wger](https://github.com/wger-project/wger) | README, arquitectura y licencias declaradas | Catálogo estructurado, datos de ejercicio separados de la programación, exportabilidad | Adoptar su backend Django además de Supabase; alcance nutricional |
| [LiftLog](https://github.com/LiamMorrow/LiftLog) | README, migraciones y puente de ejecución nativa | Migraciones comprobables y separación entre datos, interfaz y capacidades nativas | Suponer que una app React Native tiene automáticamente una web equivalente |
| [Free Exercise DB](https://github.com/yuhonas/free-exercise-db) | README y estructura de datos | Fuente alternativa para músculos, equipo, instrucciones y correspondencias | Importar cientos de variantes sin revisar calidad, procedencia y nombres |

Hevy Coach es una referencia funcional especialmente próxima: documenta que el entrenador puede registrar la sesión de un cliente, consultar su ejecución anterior y cerrar el entrenamiento. Nuestra propuesta agrega como requisito central el cambio rápido entre cinco sesiones activas. No se verificó que Hevy ofrezca exactamente esa navegación simultánea. [Fuente](https://hevycoach.com/personal-trainer/).

## 2. Hallazgos de código

### Identidad y recuperación de sesión

GymMane serializa las series, su estado, ejercicio actual y el instante de finalización del descanso. La cuenta regresiva se calcula contra ese instante, no mediante la suma de ticks. Pulso debe usar ese principio con un temporizador independiente por alumno. La vista consultada representa una sesión individual; no resuelve por sí sola nuestra simultaneidad. [Modelo inspeccionado](https://github.com/InlitX/GymMane/blob/a838709c0db5a9371baa336ea26141fb444ea13f/lib/models/live_session.dart).

Su integración de actividad en vivo utiliza canales distintos para Android/iOS y evita envíos redundantes. Aprendizaje: notificaciones, bloqueo de pantalla y temporizadores requieren adaptadores específicos; no asumir que JavaScript continuará activo al bloquear el celular. [Servicio inspeccionado](https://github.com/InlitX/GymMane/blob/a838709c0db5a9371baa336ea26141fb444ea13f/lib/services/live_workout.dart).

### Sincronización: aprender también de los límites

openGym documenta en su módulo de merge el problema de una pestaña antigua sobrescribiendo una sesión del teléfono. Introduce revisiones y reglas por tipo de dato; también reconoce que ciertas eliminaciones pueden reaparecer sin marcas de borrado. En Pulso proponemos comandos pequeños, control de revisión por alumno y archivado explícito, sin reemplazar toda la cuenta por la copia más reciente. Esta es una decisión nuestra, no una copia de ese algoritmo. [Código inspeccionado](https://github.com/DuarteSantos8/openGym/blob/e88062ed034edb232836b98619ae65eb6fd5851d/frontend/src/lib/sync-merge.js).

### Migración y plataformas

LiftLog documenta conversiones entre versiones de almacenamiento y pruebas de migración. Su README actual indica React Native/Expo y que retiró el soporte web. Eso desaconseja prometer que cualquier framework resolverá las tres plataformas sin trabajo adicional. [Migraciones](https://github.com/LiamMorrow/LiftLog/blob/52123f1e35b632b40fa84f44fa7b799ba158e407/docs/Migrations.md), [README](https://github.com/LiamMorrow/LiftLog).

### Medios con procedencia

El manifiesto consultado de Workout Guide contiene 302 ejercicios. El ejemplo de press de banca incluye tres cuadros SVG, dimensiones y atribuciones por cuadro; uno registra su derivación de Everkinetic. Sirve para construir un reproductor ligero con controles, no para prometer que todos los recursos contienen videos o GIF continuos. [Manifiesto](https://github.com/bryllim/workout-guide/blob/aac599224bb9780305239607ef98540b7e0ce389/packages/workout-guide/manifest.json).

## 3. Dirección visual propuesta

Las capturas oficiales de openGym muestran navegación reducida, tarjetas oscuras y separación entre sesión, planificación y estadísticas. Las páginas oficiales de Hevy Coach separan el constructor de escritorio del registro móvil. Son observaciones de material público; no constituyen una prueba de usabilidad de esos productos.

Para Pulso:

- Conservar la identidad verde y superficies claras del prototipo, con contraste comprobado. El tema oscuro queda para una iteración posterior.
- En móvil, priorizar nombre del alumno, bloque actual, carga/repeticiones y estado de guardado. La animación se abre a pedido, sin desplazar la entrada de datos.
- Selector persistente de alumnos: nombre abreviado, iniciales, estado y pendientes; al tocar, recuperar ejercicio y desplazamiento. No depender del color para identificar.
- Registro compacto, con detalle por serie desplegable. Referencia anterior junto al campo; ninguna ventana para cambiar un peso.
- Navegación inferior: Hoy, Alumnos, Rutinas y Más. En escritorio, barra lateral y editor con biblioteca + programación + resumen.
- Progreso por ejercicio con tabla accesible y gráfico, calendario de asistencia y distribución de series por grupo muscular. No mostrar una puntuación única de “salud” o “fatiga real”.

La jerarquía propuesta es nuestra adaptación al entrenador. No se copiarán pantallas o recursos visuales propietarios.

## 4. Reutilización y licencias

| Material | Declaración consultada | Decisión para la planificación |
|---|---|---|
| GymMane | GPL-3.0 y término adicional de atribución | Referencia de comportamiento; no incorporar código directamente al MVP |
| openGym | AGPL-3.0 | Referencia de arquitectura y casos de fallo; implementación propia |
| LiftLog | AGPL-3.0 en metadatos del repositorio | Referencia de organización/migraciones; implementación propia |
| wger | Código AGPL-3.0-or-later; contenido con licencia por entrada | Referencia funcional; cualquier importación requiere revisar la entrada concreta |
| Workout Guide | Software/documentación MIT; arte CC BY-SA 4.0 | Candidato principal, preservando licencia, autores, origen y modificaciones en cada medio |
| Free Exercise DB | El repositorio se presenta como Unlicense/dominio público | Candidato secundario; comprobar procedencia de las imágenes y revisar calidad antes de distribuir |
| Strong, Hevy Coach, Trainerize | Productos comerciales | Analizar patrones de interacción; no extraer biblioteca multimedia privada |

Fuentes de licencia: [GymMane](https://github.com/InlitX/GymMane#license), [openGym](https://github.com/DuarteSantos8/openGym), [LiftLog](https://github.com/LiamMorrow/LiftLog/blob/main/LICENSE), [wger](https://github.com/wger-project/wger#license), [Workout Guide](https://github.com/bryllim/workout-guide/blob/main/LICENSES.md), [Free Exercise DB](https://github.com/yuhonas/free-exercise-db).

Las licencias declaradas no equivalen a una auditoría de todos los activos. Antes de importar: fijar commit, guardar manifiesto/hash, registrar autor/origen/licencia y verificar obligaciones sobre el material y sus adaptaciones. La atribución irá en el detalle del ejercicio y en Créditos. No se concluye aquí que incorporar una imagen determine por sí solo la licencia de toda la aplicación.

## 5. Fuentes técnicas que condicionan el plan

| Tema | Evidencia oficial | Consecuencia en Pulso |
|---|---|---|
| Autorización | [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) | Aislamiento en la base, no solo filtros de interfaz |
| Operaciones compuestas | [Database Functions](https://supabase.com/docs/guides/database/functions) | Guardar ejecución, rutina e historial dentro de una transacción |
| Archivos privados | [Storage access control](https://supabase.com/docs/guides/storage/security/access-control) | Políticas de acceso separadas para archivos y datos |
| Avisos entre dispositivos | [Realtime](https://supabase.com/docs/guides/realtime/postgres-changes) | Invalidar y volver a consultar; no confundir aviso con confirmación de guardado |
| Correo de acceso | [SMTP](https://supabase.com/docs/guides/auth/auth-smtp) | Proveedor de correo configurado antes del piloto |
| Backups | [Supabase backups](https://supabase.com/docs/guides/platform/backups) | Separar respaldo de base y objetos Storage; ensayar restauración |
| Web hacia app | [Capacitor workflow](https://capacitorjs.com/docs/basics/workflow) | Compartir bundle web, pero construir y probar cada plataforma |
| Segundo plano web | [Background Sync](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API) | La reconexión en primer plano es obligatoria; no depender de Background Sync |
| Persistencia local | [Dexie StorageManager](https://dexie.org/docs/StorageManager) | Detectar cuota/error; solicitar persistencia sin prometer inmunidad al borrado |
| Entornos | [Supabase environments](https://supabase.com/docs/guides/deployment/managing-environments) | Separar pruebas de producción y versionar migraciones |

## 6. Conclusión de investigación

No conviene integrar una colección de aplicaciones completas. Conviene extraer patrones, preservar el dominio propio y reutilizar solamente componentes o activos identificados y compatibles. La prioridad de Pulso será: abrir al alumno correcto, registrar el valor correcto, conservarlo con su contexto y verlo desde otro dispositivo. Las animaciones y los gráficos acompañan ese flujo.

No se evaluaron “cientos” de repositorios ni se afirma haber encontrado el mejor producto universal. Se seleccionaron nueve referencias relevantes y se profundizó en tres problemas concretos: sesión en vivo, sincronización y biblioteca con procedencia.
