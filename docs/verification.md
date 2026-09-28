# Verificación del mockup

Revisión realizada con Microsoft Edge headless mediante Playwright, usando el servidor local en 127.0.0.1:4173.

- Sintaxis de `app.js` y `data.js`: correcta mediante `node --check`.
- Siete pantallas a 1440, 768, 390 y 360 px: sin desbordes horizontales del documento.
- Ningún error de JavaScript durante la revisión.
- Búsqueda de Lucía: un resultado; el enlace abre su perfil.
- Remo con mancuerna: 20 kg en semana 1 y 22 kg en semana 2. El diálogo explica la aplicación a semanas 2, 3 y 4.
- Informes de mes, seis meses, año y período histórico: mantienen el intervalo seleccionado y sus filas de ejemplo (5, 6, 12 y 3, respectivamente).
- Período personalizado fuera de las muestras: sin registros en métricas y en informe.
- Documento de rutina: cuatro semanas con tres días cada una, doce tablas de ejercicios.
- Diálogos de confirmación y reprogramación: apertura y cierre mediante Escape.
- Biblioteca móvil: apertura, selección de agregar y zonas de destino visibles.
- Inspección visual de agenda, editor y documentos en escritorio; editor, métricas e informe en celular.

## Límites

No se verificaron persistencia, drag-and-drop, cálculo de métricas ni generación de PDF: están expresamente fuera del mockup. Las imágenes de documentos son previews HTML conceptuales; los saltos de página de un PDF real requieren implementación posterior.


## Revisión 2 — verificación vigente

Microsoft Edge headless con Playwright. Siete pantallas revisadas a 1440, 768, 390 y 360 px, sin desbordes horizontales ni errores JavaScript.

- Agenda: tres destinos principales y sin panel lateral.
- Confirmación: ninguna casilla; 151 valores de peso, cuatro de series y quince de repeticiones. Confirmar 75 kg no altera la prescripción.
- Editar calentamiento en semana 2 modifica semanas 2–4 y conserva semana 1.
- Arrastre HTML nativo desde el agarre de biblioteca hacia la parte principal agrega el ejercicio.
- Alta de Marcos Pérez, copia de la rutina de Joaquín y edición a 90 kg: la rutina original conserva su valor.
- Rutina completa en cuatro secciones semanales, título RUTINA, nombre y fecha; sin RIR ni descanso.
- Rutinas anteriores de solo lectura; volver a la actual recupera controles de edición.
- Cuatro períodos de progreso conservados en el informe, con tarjetas por grupos y sin tablas de series.
- Período sin datos también vacío en el informe.
- Copiar una base de cuatro días desde el banco conserva los cuatro días y archiva la rutina anterior.
- En 390 px, agregar un ejercicio a aproximaciones desde el menú móvil funciona.

Inspección visual de perfil, progreso, editor, banco, agenda y confirmación en escritorio, y perfil/editor/progreso en móvil. Las limitaciones antiguas sobre ausencia de arrastre e interacciones de creación ya no aplican; estas funciones ahora operan en memoria. No hay exportación real ni persistencia.

## Revisión 5 — verificación vigente

Esta revisión reemplaza los comportamientos anteriores de activación inmediata y guardado únicamente en memoria.

Microsoft Edge headless con Playwright: ocho pantallas a 1440, 768, 390 y 360 px sin desbordes horizontales ni errores JavaScript.

- Abrir una anterior conserva el ID de la actual, muestra solo lectura y mantiene el contexto al recargar.
- Copiar crea un borrador; editarlo y recargar conserva el cambio sin modificar la actual.
- Activar exige el paso de revisión y archiva la anterior conservando su ID.
- Editar una plantilla del banco no modifica las copias personales.
- Guardar identidad visual persiste tras recargar y se refleja en el documento.
- Mapa corporal seleccionable con clic y teclado; modo Cargas contextualizado por ejercicio.
- Los cuatro períodos llegan intactos al informe; un intervalo sin datos queda vacío en pantalla e informe.
- Quitar ejercicios en móvil modifica solo el borrador.
- Inspección visual de progreso, borrador móvil y plantilla PDF.
- Sintaxis verificada con node --check para model.js, views.js, experience.js y app.js.

Los documentos siguen siendo vistas previas HTML. El guardado es local, sin backend ni sincronización entre dispositivos.

## Actualización: anatomía y género

- Mapa vectorial con contornos, fibras y sombreado, con vistas frontal y posterior. `anatomy.js` dibuja las variantes masculina y femenina según el perfil.
- Género (Masculino/Femenino) disponible al crear o editar alumnos y visible en su información.
- Los datos guardados de la revisión 5 se conservan. Los perfiles anteriores sin género pueden completarlo desde Editar datos.
- Verificado en el navegador: selección por clic y Enter, modos Evolución/Cargas, cambio de figura y guardado al recargar, selector obligatorio en el alta y mapa en el informe sin controles interactivos.
- Inspección visual en móvil y escritorio. Sin errores de consola en el recorrido. Comprobadas la sintaxis y la migración de datos anteriores sin perder registros ni sobrescribir un género ya elegido.

## Calendario y horarios por día

- Ver calendario permite seleccionar un día de la semana de muestra y consultar solo nombres y horarios, ordenados por hora.
- Los perfiles muestran Días y horarios. Al crear o editar un alumno se completa una hora independiente para cada día seleccionado.
- Reprogramar visita permite elegir fecha y hora para esa visita.
- Verificados: guardado al recargar, horario distinto por día reflejado en calendario, orden por hora, día vacío y reprogramación sin duplicados. El calendario no contiene estados ni controles de confirmación.

## Guardado manual de borradores — comportamiento vigente

Esta actualización reemplaza el guardado automático de borradores de la revisión 5.

- Guardar borrador conserva una copia independiente por alumno. Las ediciones siguientes quedan pendientes hasta volver a pulsarlo.
- Ninguna otra acción (navegación, edición de otro alumno o guardado de datos) persiste esos cambios pendientes.
- Los borradores anteriores se mantienen. Recargar recupera la última copia guardada; el navegador advierte si hay cambios pendientes.
- Activar requiere guardar primero. Un error al guardar conserva los cambios abiertos y la versión guardada anterior.
- Verificado con seis pruebas de regresión: `node --test --test-isolation=none tests/manual-draft.test.cjs`.
- Verificado en interfaz: botón Guardar borrador, estados pendiente/guardado y conservación al recargar. El borrador creado para probar fue descartado; la rutina actual se conservó.

## Historial, bancos y ejercicios sin valores predeterminados

- Historial dentro del alumno con filtros Todo, Rutinas, Entrenamientos y pesos, Cambios, Datos y visitas. Incluye registros anteriores disponibles y auditoría de cambios nuevos. Paginación y detalle desplegable.
- Guardar un borrador registra las diferencias de peso/series/repeticiones y estructura por semana. Activar, descartar, corregir entrenamientos, reprogramar y editar el perfil agregan eventos propios.
- Las correcciones conservan antes/después; Progreso usa el último valor vigente sin duplicar el registro de esa sesión.
- Banco de rutinas sin Usar en alumno; Nueva plantilla solo solicita nombre y cantidad de días. Siempre crea cuatro semanas vacías.
- Banco de ejercicios con búsqueda, filtro por grupo y alta. Los ejercicios agregados a rutinas o plantillas tienen peso, series y repeticiones null y se muestran sin definir. Un borrador incompleto puede guardarse, pero no activarse.
- Sin Ver documento en borradores.
- 14 pruebas pasan: `node --test --test-isolation=none tests/manual-draft.test.cjs`. Incluyen persistencia manual, rollback, historial y correcciones, plantilla vacía, alta de ejercicios, duplicados y valores sin definir.
- Revisadas en navegador las pantallas de historial y banco de ejercicios, filtros, detalle de sesiones y formulario de nueva plantilla; sin errores de consola y sin desborde de página a 1440 px. Inspección visual también en móvil.


## Mapa muscular completo y documento sin selección

- Las figuras masculina y femenina incluyen 17 grupos: pecho, espalda, hombros, trapecios, bíceps, tríceps, antebrazos, abdominales, oblicuos, lumbares, glúteos, abductores, aductores, cuádriceps, isquios, pantorrillas y tibial anterior.
- El documento conserva los colores de los registros, pero nunca el contorno del músculo seleccionado ni controles interactivos.
- Elegir un grupo sin registros mantiene la selección y muestra “Sin datos en este período”; no inventa valores ni cambia a otro músculo.
- Los alias comunes (por ejemplo, gemelos/pantorrillas) se asocian a la misma zona del mapa.
- Pasan 18 pruebas con `node --test --test-isolation=none tests/manual-draft.test.cjs`. Revisado también en navegador el documento sin resaltado y la selección de antebrazos sin registros.


## Revisión 6 · 28 de septiembre de 2026

- Node v24.19.0: 35 pruebas correctas (18 regresiones adaptadas al arranque asíncrono y 17 nuevas). Syntax checks de todos los JS y git diff --check correctos.
- IndexedDB real en el navegador integrado: 10 comprobaciones correctas desde tests/browser/training-checks.html. Incluyen cinco sesiones, recuperación desde otra conexión, auditoría, aborto, conflicto, autosave, cierre idempotente, dos sesiones el mismo día, restauración y renovación mensual.
- Recorrido UI: iniciar una sesión, cambiar 40 → 42 kg, esperar confirmación y recargar. La sesión sigue abierta y el campo conserva 42 kg.
- Continúan las comprobaciones visuales y la revisión independiente; se documentarán sus resultados al concluir.
