# Auditoría final de interfaz y funcionamiento · 11 de octubre de 2026

Revisión adicional de personal trainer, gimnasio y entrenado sobre la entrega `b9e0851`. Se conservaron la identidad de Pulso y los flujos acordados: registro directo por serie, días numerados, calendario semanal, presets, progresiones, descansos legibles y borradores recuperables.

## Hallazgos y correcciones

- Los enlaces a un alumno inexistente podían quedar cargando indefinidamente. Ahora distinguen carga, error de conexión y alumno no disponible, con reintento y regreso a la lista. Las plantillas mantienen una ruta independiente para no confundir sus identificadores con los de alumnos.
- El cierre de un entrenamiento con una edición pendiente se deshabilitaba sin explicar cómo resolverla. El diálogo muestra el motivo y lleva al primer campo pendiente, incluso dentro de un bloque cerrado. Las anotaciones se conservan.
- Algunos controles del entrenador eran demasiado estrechos. Las opciones de serie y correcciones tienen un área de al menos 44 px; los selectores de descanso tienen 48 px de alto y texto de 16 px. Se verificó también el campo enfocado con poco espacio vertical.
- WebKit podía deshacer la selección al tocar un número y mezclar el nuevo valor con el anterior. Los campos numéricos compartidos de rutinas y sesiones resuelven el foco y la selección durante el primer toque, antes de que el navegador coloque el cursor. Los toques siguientes permiten corregir parte del valor.
- El botón del calendario podía medir 44 × 48 px con entrada táctil. Su altura mínima explícita conserva el cuadrado de 44 × 44 px alineado al título.
- En pantallas de hasta 400 px, las semanas se organizan en dos columnas y la configuración del bloque en una, evitando rótulos y selectores apretados. El cambio es compartido por los tres roles.

## Matriz de revisión

| Área | Recorridos y combinaciones |
| --- | --- |
| Acceso y cuenta | Login por rol, errores, permisos, suspensión/reactivación, ajustes y salida con trabajo pendiente. |
| Agenda y alumnos | Calendario semanal, flechas/Hoy, cruces de mes/año, horarios habituales y extras, ficha, edición, agenda, historial y enlaces no disponibles. |
| Rutinas | Catálogo, plantillas, rutina asignada y propia, edición, presets, progresión, copiar semana/día, borrador incompleto, activar con un ejercicio por día y guía del día pendiente. |
| Conservación del trabajo | Recarga, navegación entre alumnos, respuesta perdida, retry idempotente, conflicto de versiones, pestañas y datos numéricos incompletos. |
| Entrenamiento | Peso/repeticiones/tiempo, coma decimal, confirmación, corrección, omisión, reloj y descanso del bloque, sesiones largas, cierre con ediciones pendientes y respuesta perdida al finalizar. |
| Consulta | Favoritos, biblioteca, progreso, filtros, fechas, exportación de rutina/progreso, CSV e impresión. |
| Interfaz | Chromium y WebKit; 320, 390, 768 y 1440 px, además de los anchos incluidos en las suites existentes. Foco, navegación, modales, tamaños, alineación, desbordes y capturas de pantalla. |

La nueva regresión de sesión mixta confirma que un tiempo inválido sobrevive a la recarga sin convertirse en un resultado válido, una omisión se conserva y una finalización confirmada por el servidor se recupera después de perder su respuesta. Se añadieron pruebas de rutas inválidas, recuperación de conexión, selección de valores y acceso directo a ediciones pendientes.

## Verificación reproducible

La configuración `playwright.audit.config.ts` reúne los recorridos de interfaz en WebKit y Chromium. La suite principal mantiene las comprobaciones de datos, seguridad, sincronización y concurrencia; CI verifica además SQL y la aplicación PWA construida.

```text
npm run typecheck
npm test
npm run test:db
npm run build
npm run test:e2e
npx playwright test --config playwright.audit.config.ts
npm run test:pwa
```

Los resultados finales y la publicación se registran en el PR y en el Space. Las pasadas exploratorias sirvieron para reproducir los fallos antes de corregirlos; no se consideran una aprobación del código final.

## Alcance de la evidencia

Las operaciones que crean o cambian datos usan cuentas ficticias de Supabase local. Esta entrega no agrega migraciones ni modifica Supabase cloud. La comprobación del despliegue productivo es de lectura.

Se cubren las combinaciones descritas, no todas las combinaciones teóricas de estados. La emulación no sustituye el uso con teclado, tacto, instalación y suspensión en teléfonos físicos; esa validación y el piloto real siguen documentados como pendientes operativos.
