# Seguimiento de entrenamientos en vivo

Fecha: 28 de septiembre de 2026.
Estado: especificación escrita aprobada por el usuario. Implementación pendiente.

## Objetivo y alcance

El entrenador atiende a unos cinco alumnos simultáneamente. Necesita registrar pesos y repeticiones durante el entrenamiento, cambiar de alumno sin perder lo anotado, consultar el historial y cerrar cada sesión cuando termina. El usuario aprobó también las faltas sin reprogramación, las llegadas espontáneas, los bloques libres, los descansos y la continuidad mensual de las rutinas. Destacó como prioridad la confiabilidad del guardado.

Esta revisión cambia el mockup existente de HTML, CSS y JavaScript. Incluye persistencia local comprobable y respaldo manual exportable. No convierte por sí sola la demo en un servicio de producción: una base de datos remota, autenticación y copias automáticas externas requieren una etapa de infraestructura. Esa limitación debe figurar en la entrega; la aprobación del flujo no implica aceptar el navegador como único almacenamiento de datos reales.

## Situación actual y decisiones

Actualmente `model.js` guarda una copia del estado en localStorage; los borradores tienen guardado manual independiente. `history.js` identifica resultados por fecha, ejercicio y rutina, lo que puede mezclar dos sesiones del mismo día. `app.js` realiza además un guardado general cuyo resultado no siempre se comprueba. La agenda y varias fechas están fijas en el 23 de septiembre de 2026. Los días de rutina tienen tres zonas fijas y cuatro semanas.

Se consideran tres alternativas: ampliar únicamente localStorage; introducir almacenamiento local transaccional; o incorporar ahora un servicio remoto completo. Se elige IndexedDB para esta revisión: permite guardar datos relacionados en una transacción y detectar escrituras concurrentes sin añadir un servicio externo a la demo. La primera alternativa deja más frágil el control de concurrencia; la tercera requiere definir cuentas, alojamiento y recuperación de respaldos antes de prometer protección para uso real.

## Flujo cotidiano

- La agenda distingue visitas pendientes, en curso, finalizadas, ausencias y reprogramaciones. Los estados pertenecen a cada visita, no al perfil completo del alumno.
- «Entrenando ahora» mantiene visibles los alumnos con una sesión abierta. Un selector compacto permite alternar entre ellos y recuperar bloque abierto, posición y valores pendientes.
- «Iniciar» crea una sesión con identidad propia y una copia del día elegido de la rutina. Se elige día y semana; la app no impone siempre la segunda semana.
- «Agregar entrenamiento ahora» permite buscar un alumno existente, precargar fecha y hora locales actuales, elegir el día de rutina e iniciar. No cambia sus horarios habituales. Si tiene una sesión abierta, ofrece volver a ella sin crear otra por accidente.
- «No asistió» registra una falta sin exigir fecha alternativa. Reprogramar conserva el origen y vincula la nueva visita. No se transforma una sesión iniciada en ausencia.
- «Finalizar entrenamiento» espera todos los guardados, valida los datos y cierra una sola vez. Mientras hay errores de guardado o campos inválidos, el cierre queda bloqueado con explicación.
- Se permite señalar un ejercicio como omitido, para no convertir automáticamente lo planificado en actividad realizada. Al finalizar se confirma el resto con sus valores visibles.
- Una sesión abierta se retoma después de recargar o al día siguiente; no se cierra automáticamente a medianoche. No puede haber dos sesiones abiertas del mismo alumno, pero sí sesiones sucesivas en un mismo día.

## Rutina, bloques y edición directa

Cada día contiene una lista ordenada de bloques con identificador, nombre, tipo y ejercicios. Se pueden agregar, renombrar, ordenar y eliminar bloques sin un límite fijo de cantidad. La migración convierte movilidad, aproximaciones y parte principal en tres bloques equivalentes, conservando orden y contenido. El tipo permite mantener los filtros de Progreso.

Peso, repeticiones, series y descansos se editan en las celdas. No se abre un diálogo para ajustar un número. Los controles tienen etiqueta accesible, foco estable, teclado numérico en móvil y errores junto al campo. Se mantienen los límites actuales de peso, series y repeticiones en esta revisión: 0–150 kg, 1–4 series y 1–15 repeticiones, todos enteros. No se agregan límites nuevos a la cantidad de bloques.

El descanso micro se indica por ejercicio, en segundos, para la pausa antes del siguiente ejercicio. El macro se indica por bloque, con destino explícito «entre series» o «entre bloques». Ambos admiten enteros de 0 a 3600; vacío significa sin definir y cero significa sin descanso. No se inventan descansos al migrar rutinas antiguas.

Durante una sesión, un valor válido actualiza el registro en curso y la prescripción del mismo ejercicio del mismo día, desde la semana seleccionada en adelante. No modifica otros alumnos, plantillas, semanas anteriores ni sesiones históricas. No propaga cambios por nombre: usa las identidades de las posiciones de ejercicio y su correspondencia entre semanas. Dos apariciones del mismo ejercicio pueden tener cargas distintas.

La edición estructural de una rutina sigue usando borrador, guardado manual y activación. Los campos del borrador también se editan directamente, pero conservar el guardado manual evita cambiar una regla ya establecida. Si hay una sesión abierta, la activación de otra rutina se posterga hasta cerrarla. Si existe un borrador basado en una revisión anterior a los ajustes en vivo, su activación muestra esas diferencias y exige resolverlas; no debe restaurar cargas antiguas silenciosamente.

## Guardado e historial

Un módulo de almacenamiento concentra todas las escrituras. El arranque espera la carga antes de permitir editar. Se elimina el guardado incondicional al final de cualquier acción.

Cada sesión, visita, operación y evento recibe un identificador único. Una sesión conserva alumno, visita, rutina, período, día, semana, hora de inicio, hora de cierre, estado y copia de ejercicios. Cada cambio conserva fecha y hora, campo, valor anterior, valor nuevo y referencias a la sesión y al ejercicio. El historial es acumulativo; una corrección añade evidencia del cambio anterior.

Los cambios válidos se encolan al escribir con una espera breve de 300 ms, o inmediatamente al salir del campo, pulsar Enter o cambiar de alumno. Una secuencia de tecleo se considera una edición, no un evento por carácter. Las operaciones se serializan y una respuesta vieja nunca puede reemplazar una edición más reciente.

La transacción guarda juntos sesión, rutina y evento de historial, junto con una revisión global. Se indica «Guardando», «Guardado en este dispositivo» o «No se pudo guardar · Reintentar». Solo la confirmación de la transacción permite mostrar éxito. Si falla, permanece la versión confirmada en disco y se conserva la entrada pendiente en memoria para reintentar. Los valores pendientes no se prometen recuperables tras cerrar el navegador; se advierte al salir si todavía existen.

Cada escritura comprueba la revisión almacenada dentro de su transacción. Si otra pestaña escribió primero, no se sobrescribe su estado con una copia vieja: se conserva la entrada local pendiente y se solicita recargar el estado confirmado para reaplicar el cambio. No se anuncia sincronización entre dispositivos.

El cierre es idempotente: doble clic o reintento producen un solo cierre y un solo conjunto de resultados. Progreso consume únicamente resultados de sesiones finalizadas y registros históricos anteriores; los ajustes intermedios aparecen en el historial, sin multiplicar puntos de progreso. Las correcciones de sesiones finalizadas conservan antes y después y no cambian la prescripción futura automáticamente.

Se ofrecen exportación y restauración de una copia JSON versionada. La copia contiene solo datos confirmados y se informa si hay pendientes. La restauración valida esquema y referencias antes de escribir, muestra qué reemplazará y requiere confirmación. No se restaura mientras haya sesiones abiertas o cambios pendientes. Exportar una copia no equivale a disponer de respaldo automático externo.

## Meses y fechas

Una rutina corresponde a un mes calendario explícito. Las cuatro variantes semanales actuales se conservan; los días del 29 al final del mes usan la cuarta variante por defecto. El entrenador puede seleccionar otra semana para la sesión.

Al abrir la app en un mes nuevo se archiva una copia independiente del período anterior y se crea la continuidad mensual con los últimos valores. La operación es transaccional e idempotente por alumno y mes. Un borrador pendiente no se activa automáticamente. Si hay varios meses sin abrir la app, se crea la continuidad del mes actual dejando constancia del salto, sin inventar entrenamientos ni archivos de meses no utilizados.

Si hay una sesión abierta del período anterior, la renovación de ese alumno se pospone hasta su cierre para incluir sus últimos ajustes y no modificar un mes ya archivado. Las sesiones siguen vinculadas a su período original.

La fecha operativa se obtiene del reloj local y se vuelve a comprobar al iniciar o cerrar sesiones y recuperar el foco de la app. Las pruebas inyectan el reloj. Los datos ficticios existentes conservan sus fechas originales; ningún cambio de fecha fabrica asistencias pasadas.

## Migración y organización

La migración lee la clave v5 existente, valida y convierte una copia, y escribe la nueva versión en una transacción. Conserva intacta la clave anterior como recuperación. Una carga inválida muestra un error recuperable; no reemplaza automáticamente datos del usuario por datos ficticios. Solo un almacenamiento realmente vacío inicializa la demo.

Se conservan alumnos, plantillas, rutinas actuales y archivadas, borradores guardados, registros, historial, horarios y personalización. Los registros históricos sin identidad de sesión se presentan como registros anteriores, sin atribuirles sesiones exactas ni horas inventadas.

Se separan almacenamiento, operaciones de sesiones y migración del renderizado. `model.js` mantiene las entidades y consultas; `history.js` y las métricas consumen resultados y eventos; `views.js`, `experience.js`, `app.js` y `calendar.js` integran el flujo. Los documentos y plantillas también recorren bloques variables. Se preservan el banco de ejercicios y los borradores independientes.

## Criterios de aceptación y comprobación

1. Abrir cinco entrenamientos, cambiar valores en todos, alternar entre alumnos y recargar: se recuperan sesiones y valores confirmados, sin cruces entre personas.
2. Cambiar 20 → 22 → 24 kg en ediciones separadas: recuperar tres estados mediante el historial y 24 como valor actual; el cierre genera un único resultado final.
3. Provocar una escritura fallida: no mostrar éxito, no guardar parcialmente rutina o historial, conservar el pendiente y poder reintentar sin duplicados.
4. Cerrar dos veces y registrar dos sesiones sucesivas del mismo alumno en un día: un cierre por sesión y resultados separados por identidad.
5. Abrir dos pestañas y escribir desde estados desactualizados: detectar el conflicto y evitar que una borre cambios de la otra.
6. Migrar una copia v5 y verificar cantidades y contenido de alumnos, rutinas, borradores, registros e historial; rechazar un archivo dañado sin perder el original.
7. Marcar una falta y agregar una llegada espontánea: persistir ambas visitas sin alterar horarios habituales.
8. Crear y reordenar bloques, editar descansos y valores directamente: conservarlos al guardar y mostrarlos en sesión, historial y documentos según corresponda.
9. Cambiar de mes y recargar varias veces: crear una sola continuidad, conservar el mes anterior y resolver correctamente una sesión abierta o un borrador previo.
10. Exportar y restaurar una copia en un almacenamiento vacío: recuperar datos equivalentes después de validar y confirmar.
11. Verificar teclado, foco, selección de alumnos y ausencia de desbordes en escritorio y móvil. Ejecutar regresiones de borradores, activación, catálogo, calendario y Progreso.

La entrega debe distinguir pruebas ejecutadas de escenarios todavía no verificados. Hasta implementar y comprobar este diseño, no se puede afirmar que el nuevo guardado funciona. Aun después, el guardado local no protege frente a pérdida del dispositivo o borrado de datos del navegador; para uso real hace falta almacenamiento remoto con respaldos y una prueba de recuperación.
