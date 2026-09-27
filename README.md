# Pulso · Mockup para personal trainers

Ejecutar `python -m http.server 4173 --bind 127.0.0.1` y abrir http://127.0.0.1:4173/?v=5#profile.

## Revisión 5

La navegación principal contiene Agenda, Alumnos, Banco de rutinas y Banco de ejercicios. La rutina personal, sus documentos, progreso e historial se encuentran dentro del alumno. No hay historial global.

### Rutinas y guardado

- Actual: la rutina en uso, de solo lectura. «Preparar cambios» crea una copia editable.
- Borrador: se guarda únicamente al pulsar **Guardar borrador**. Los cambios pendientes se mantienen en memoria al navegar, pero al recargar se recupera la última versión guardada. Copiar una rutina anterior o una plantilla crea un borrador sin guardar, sin cambiar la actual.
- Activar: requiere guardar el borrador y revisar el cambio; archiva la actual y pone el borrador en uso.
- Anterior: consulta de solo lectura con su propio rótulo. Abrirla nunca la convierte en actual.
- Banco: las plantillas se editan y renombran; sus copias en alumnos son independientes.

### Recorridos para probar

- Agenda: confirmar un entrenamiento con desplegables de peso de 0 a 150 kg (pasos de 1 kg), series de 1 a 4 y repeticiones de 1 a 15, sin casillas de verificación. Los resultados no cambian la prescripción futura.
- Alumnos: Nuevo alumno, datos y días de asistencia, y creación de su rutina desde cero, desde una plantilla o desde otro alumno.
- Perfil: información, días y horarios, rutina actual, rutinas anteriores de solo lectura, progreso e historial.
- Editor: arrastrar desde el agarre de la biblioteca hacia cualquier zona. También se puede usar el botón +. Movilidad, aproximaciones y parte principal son editables. Solo hay peso, series y repeticiones. Los cambios de ejercicios aplican a la semana elegida y posteriores.
- Banco de rutinas: editar bases completas y crear plantillas siempre desde cero, con días vacíos. Para usar una base, se elige al crear el borrador desde el perfil del alumno.
- Banco de ejercicios: catálogo completo, búsqueda, filtro por grupo y alta de ejercicios. Al agregar a una rutina, peso, series y repeticiones quedan sin definir.
- Historial del alumno: rutinas actuales y anteriores, sesiones con peso/series/repeticiones y comparación con el registro anterior, cambios guardados en borradores, correcciones y cambios de perfil o visita. Los cambios detallados se registran desde esta actualización; no se reconstruyen cambios antiguos que no estaban guardados.
- Progreso: mapa corporal frontal y posterior, modos Evolución y Cargas, comparación antes/ahora, curvas por ejercicio y barras por grupo. Períodos de un mes, seis meses, un año o fechas personalizadas.
- Documentos: una rutina completa con cuatro semanas y todos sus días; título RUTINA, nombre y fecha. Informe de progreso del mismo período seleccionado. Ambos usan la plantilla global personalizable.

## Límites de la demo

Los cambios se conservan al recargar mediante localStorage en este navegador y origen. No hay backend, autenticación, sincronización entre dispositivos ni generación real de PDF. Los documentos son previews HTML; la maquetación de impresión final se entregará en otra etapa. Borrar los datos del sitio elimina los cambios locales.

La fecha de la demo es el 23 de septiembre de 2026. Las personas, rutinas y registros son ficticios. Cada alumno tiene datos y copias independientes. La agenda muestra solo el día de ejemplo; una visita reprogramada fuera de ese día deja de aparecer. Copiar una base con más días que la asistencia mantiene todos los días; el entrenador puede asignarlos o quitarlos.

Las métricas muestran cargas externas del mismo ejercicio, no una estimación de fuerza absoluta ni comparaciones entre máquinas. La tarjeta de cada grupo identifica el ejercicio de mayor carga y el de mayor incremento. No se suman series como medida principal. Los resultados reales de la sesión se separan de las indicaciones.

## Estructura

- `data.js`: referencia ficticia de personas y ejercicios.
- `model.js`: copias independientes, rutinas, registros de muestra y filtros de períodos.
- `ui-core.js`: iconos y elementos compartidos.
- `views.js`: pantallas y previews de documentos.
- `app.js`: navegación e interacciones de la demo.
- `experience.js`: estados de rutinas, borradores, mapa corporal y personalización de documentos.
- `experience.css`: estilos de la revisión 5.
- `styles.css`: escritorio y móvil, sin dependencias externas.

Los borradores no tienen vista de documento. Se pueden guardar incompletos; antes de activar hay que completar todos los ejercicios. Las correcciones de entrenamientos conservan los valores anteriores en el historial y Progreso consulta el registro corregido.
