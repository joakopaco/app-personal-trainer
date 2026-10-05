# Banco de ejercicios en el editor

El editor compartido de rutinas de alumnos y plantillas conserva Agregar ejercicio y suma un banco lateral con búsqueda, grupos musculares desplegables y arrastre hacia cada bloque. Incluye el catálogo base y los ejercicios propios del entrenador.

En pantallas menores a 1200 px el banco se despliega sobre el editor. Cada ejercicio tiene un botón + y un selector de bloque de destino, también utilizables con teclado. Si el día está vacío, agregar crea su primer bloque. La semana y el día seleccionados determinan el destino; cambiar la plantilla no altera rutinas ya asignadas.

Ambas formas de agregar usan la misma modificación del documento y el guardado existente. Cada incorporación genera identificadores independientes y conserva las prescripciones de los ejercicios previos. Durante una operación de guardado se bloquea la edición.

## Verificación

- 73 pruebas unitarias, typecheck y build de producción aprobados.
- 8 pruebas en Chromium y WebKit: llegada espontánea, temporizador persistente, pantallas móviles y las dos nuevas pruebas del banco en cada motor.
- 8 pruebas adicionales aprobadas de geometría del frontend, catálogo de plantillas, independencia de las copias, reintentos de guardado y entrenamiento desde celular.
- Arrastre real con mouse al segundo bloque, sin modificar el primero; Agregar ejercicio sigue funcionando; guardado y recarga conservan ambos ejercicios y valores anteriores.
- Interacción táctil en plantillas, creación del primer bloque, selección del segundo bloque, cambio de semana y recuperación del borrador al recargar.
- Capturas a 320, 375, 768 y 1440 px en `.local/screens/routine-palette/`; revisión visual y control de desbordamiento horizontal.
- WebKit convirtió los formatos personalizados de DataTransfer durante el arrastre. El editor conserva la identidad del ejercicio en una referencia interna iniciada por el banco y la limpia al soltar o finalizar. Esto permite validar el destino sin aceptar texto arrastrado desde fuera del editor.

Las pruebas móviles usan emulación táctil de Playwright, no dispositivos físicos. El flujo táctil recomendado es el botón +; el arrastre está comprobado con mouse.
