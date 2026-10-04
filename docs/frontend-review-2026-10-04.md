# Revisión de interfaz: ficha, rutinas y progreso

## Cambios

- Encabezado compartido para Información y rutinas, Rutina actual, Progreso e Historial. El nombre del alumno, el botón de volver y las pestañas mantienen posición y dimensiones.
- El contenedor principal define el ancho de las cuatro secciones. Separación de 24 px entre secciones y de 12 px entre acciones; los botones se acomodan en celular.
- Rutinas anteriores muestra nombre, inicio y fin, con detalle de solo lectura y exportación. Se retiraron los selectores de mes y versión.
- Las renovaciones y los ajustes de prescripciones se agrupan por nombre e identidad de los días. El inicio es la primera publicación del grupo y el fin es la publicación de la siguiente rutina diferente. No se inventan fechas de fin; la vigente indica que sigue en curso. Todas las revisiones originales permanecen en la base.
- Historial contiene asistencia reciente y registro de cambios con paginación propia. Se retiraron sesiones, exportación y archivo repetido de rutinas.
- Progreso exporta la anatomía frontal y posterior, con los músculos que tienen registros, además de gráficos y tablas. El gráfico impreso usa proporciones estables y conserva los colores de Pulso.
- El enlace de resultados al terminar un entrenamiento lleva a Progreso.

## Verificación

- Typecheck y build de producción correctos.
- 73 pruebas unitarias correctas, incluidas agrupación de rutinas, renovaciones y fechas.
- 16 pruebas de navegador: revisión visual, agenda/reprogramación, ficha, plantillas, rutinas anteriores, exportaciones y entrenamiento en vivo. Prueba adicional de conservación de series e historial simplificado correcta.
- Repetición de revisión visual y exportaciones después de ajustar el PDF: correcta.
- Se comprueba por geometría que el encabezado coincide en las cuatro pestañas y que los botones no se superponen ni generan desbordamiento horizontal.
- Capturas de 390 y 1440 px: acceso, registro, recuperación, Hoy, alumnos, alta de alumno, perfil, rutina y editor, progreso, historial, catálogo y editor de plantillas, ejercicios, alta/detalle/selector de ejercicio, ajustes y contraseña.
- Capturas adicionales de entrenamiento móvil y detalle de rutina anterior. PDF de progreso renderizado con Poppler y revisado visualmente, tanto mapa anatómico como gráfico/tabla.
- Evidencias locales en `.local/screens/front-review/`; utilizan únicamente alumnos de prueba de Supabase local.

La validación visual automatizada usa Chromium. No representa una prueba en dispositivos físicos de todas las versiones de Android/iOS.
