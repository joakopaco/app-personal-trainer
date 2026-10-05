# Auditoría del frontend — 5 de octubre de 2026

Revisión de Pulso con cuentas y datos locales de prueba. Las acciones de alta, suspensión, restablecimiento, archivo y eliminación no se ejecutan contra cuentas reales.

## Pantallas y controles cubiertos

| Área | Pantallas y acciones verificadas |
| --- | --- |
| Acceso | Ingreso, registro de personal trainer, recuperación, confirmación, primer cambio de contraseña de gimnasio, límites entre roles. |
| Hoy y agenda | Fecha, agregar alumno al entrenamiento, elegir semana y día, reprogramar una visita, conservar horario habitual, volver a sesiones abiertas. |
| Alumnos | Buscar, crear, editar ficha y horarios, archivar/restaurar, navegar entre información, rutina, borradores, progreso e historial. |
| Rutinas de alumnos | Ver vigente; crear desde cero, plantilla, otro alumno o rutina anterior; guardar, activar, descartar; preservar la vigente durante la preparación. |
| Catálogo y editor | Crear, buscar, editar, duplicar, eliminar; semanas, días, bloques, series; banco de ejercicios por arrastre y por botón; exportar. |
| Entrenamiento PT | Varias sesiones, registrar series, omitir, modificar prescripción, temporizador, finalizar, volver, conservar registros al recargar. |
| Progreso e historial | Filtros, anatomía, selección de ejercicios, registros y exportación con figura humana. |
| Ejercicios y ajustes | Buscar y filtrar, detalle, crear ejercicio propio, cancelar; perfil, cambio de contraseña, cierre de sesión. |
| Administración privada | Listado, alta, suspensión, reactivación y restablecimiento; errores visibles dentro de la confirmación y reintento. |
| Gimnasio | Resumen, entrenados, ficha y notas privadas, catálogo, asignación personalizada, publicación, duplicación, descarte, ajustes. |
| Entrenado | Selección de catálogo o personalizada, única rutina propia, edición, entrenamiento, progreso, exportación y cuenta. |
| Fallos de red | Edición conservada, respuestas perdidas, conflictos entre dispositivos, errores de confirmación y recuperación sin bloquear la navegación. |

## Revisión responsive y visual

- Pantallas principales de PT: 320, 390, 768, 1024 y 1440 px. Se comprueba alineación estable de la cabecera del alumno, campos dentro de sus contenedores, ausencia de desbordamiento horizontal y botones sin intersecciones.
- Gimnasio: matriz a 320, 375, 390 y 820 px; recorridos completos a 320, 768 y 1440 px. Administración privada a 320, 768 y 1440 px.
- WebKit y Chromium con emulación táctil. Capturas de viewport y páginas completas; inspección visual de formularios, modales, editores, listados, anatomía y exportaciones.
- Evidencias locales: `.local/screens/front-review/`, `front-audit/`, `gym/`, `mobile/`, `account-controls/` y `training-errors/`. Las imágenes de página completa incluyen la barra fija a la altura del viewport; eso no representa una barra insertada en el contenido.

## Correcciones de esta revisión

1. Botones de semanas en dos columnas, con texto legible y mayor espacio táctil, en pantallas de hasta 400 px. Se reutiliza la misma regla en PT y gimnasio sin cambiar su lógica.
2. Mensajes de error de suspensión/reactivación visibles dentro del diálogo correspondiente; se limpian al iniciar otra operación y se permite reintentar.
3. Mensajes de error de finalización y recuperación de entrenamientos de gimnasio visibles dentro del diálogo. Un conflicto al finalizar cierra esa confirmación y deja accesible la revisión de la versión guardada.

## Alcance de la evidencia

Resultado: 78/78 recorridos E2E de la batería completa, 75/75 unitarias, typecheck y build correctos. La comprobación específica de fallos de cierre/recuperación también pasó. Matriz móvil PT: 12/12. Matriz gimnasio: 11/12 en la primera pasada; el caso WebKit a 768 px se corrigió para esperar a que terminara el cierre de sesión antes del próximo ingreso y pasó al repetirlo (1/1). No quedó ningún fallo pendiente. Los 12 casos de gimnasio están verificados en conjunto, no se presentan como una única pasada sin fallos.

Los recorridos automatizados comprueban los controles indicados y los estados normales y de fallo enumerados. No prueban cada combinación posible de datos, todas las versiones de navegador ni dispositivos físicos. La exportación comprueba documento, anatomía y apertura de impresión; no una impresora física. No se modifica la lógica ni los datos existentes de personal trainer.
