# Rutinas y registro del personal trainer · 8 de octubre de 2026

## Resultado

La preparación de rutinas usa los días reales de la agenda del alumno; una plantilla admite hasta seis días. Las rutinas de alumnos con siete días de agenda pueden conservar sus siete días y exportar una recuperación completa. Si una base tiene más días que la agenda elegida, el asistente informa la incompatibilidad sin eliminar contenido silenciosamente.

El editor ofrece series de 1–4, repeticiones de 4/6/8/10/12 y descansos de 30 s, 1 min, 3 min o 5 min. Los valores anteriores siguen siendo legibles y se pueden reemplazar por las opciones nuevas. La progresión opcional permite objetivos de peso y repeticiones por serie. El descanso macro aparece exclusivamente en el bloque. Los tiempos se muestran en segundos o minutos y segundos, incluidos valores anteriores como 45 s y 1 min 30 s.

La copia de semanas permite elegir destinos y advierte qué se reemplaza; los días tienen controles visibles para renombrar, duplicar, ordenar y eliminar. Los días ligados a la agenda no se pueden aumentar arbitrariamente. La lectura de una rutina muestra un día a la vez y tablas de progresión; impresión e historial conservan los objetivos.

El registro durante el entrenamiento muestra las series desde el inicio: número, peso, repeticiones y confirmación alineados. Los ajustes generales, omisiones y correcciones siguen disponibles. El temporizador y la cabecera ocupan menos espacio en teléfono. Un indicador verde de carga se comparte entre arranque y pantallas de espera y respeta movimiento reducido.

## Referencia visual

Se revisó el video aportado de Strong y sus [pantallas oficiales](https://www.strong.app/) y [documentación de bloques](https://help.strongapp.io/article/98-supersets-and-circuits). La referencia se limita a claridad visual y ergonomía: filas de series, alineación de datos, confirmación directa y descanso legible. Pulso conserva sus funciones, permisos, vocabulario y paleta blanca, negra y verde lima.

## Fallos corregidos y cubiertos

- Guardado local que podía aparentar éxito antes de finalizar, incluso con IndexedDB sin espacio; snapshots mutables y escrituras atrasadas entre pestañas.
- Borradores locales difíciles de recuperar si fallaba la consulta remota; cambios que reaparecían tras guardar, publicar o descartar.
- Respuestas perdidas de guardado/publicación que podían provocar operaciones duplicadas. Se conserva el comando exacto para reintentar tras recarga.
- Navegación Atrás/Adelante con cambios que solo estaban en memoria. Se bloquea la salida y se ofrece recuperación JSON.
- Anotaciones numéricas antiguas que quedaban bloqueadas detrás de los selectores nuevos; valores explícitamente vacíos que reaparecían al desactivar progresión.
- Descansos macro guardados bajo un segundo ejercicio por versiones anteriores: ahora se recuperan uno a uno desde el control del bloque.
- Escrituras rápidas de series que retiraban la protección mientras quedaba otra pendiente; hidratación tardía que podía pisar una edición; descarte concurrente con una nueva edición.
- Fallo de sincronización posterior al guardado local que podía bloquear una serie ya registrada; recuperación explícita de anotaciones JSON inválidas.
- Diferencias entre proyección local y SQL con objetivos nulos; rechazo de ajustes de descanso cuando la progresión tenía valores generales vacíos; preservación de series observadas e historia inmutable.
- Desborde en Safari móvil de un selector con un descanso antiguo largo.

## Evidencia

Pruebas sobre Supabase local aislado con identidades ficticias; no se ejecutan fixtures contra producción.

| Comprobación | Resultado |
| --- | --- |
| TypeScript | Aprobado |
| Vitest | 119 pruebas, 30 archivos, aprobadas |
| Código anterior | 43 pruebas aprobadas |
| PostgreSQL / pgTAP | 80 verificaciones, 6 archivos, aprobadas |
| E2E completo Chromium | 96 recorridos aprobados |
| PWA compilada | 5 recorridos aprobados: arranque offline, persistencia, actualización y administración |
| Emulación táctil Chromium/WebKit | 11 de 12 aprobados inicialmente; el caso de desborde WebKit fue corregido y aprobado al repetir las pantallas a 320/375/768 px |
| Revisión directa de interfaz | Catálogo, editor de plantilla, copia semanal, registro de entrenamiento y descansos; escritorio y ancho móvil |

Las pruebas cubren cuenta ajena, publicación por revisión, pérdida de respuesta, varios alumnos, conflictos entre dispositivos, recuperación de borradores, progresión real en SQL y cierre observado/rápido. La revisión independiente de código originó correcciones adicionales y terminó sin hallazgos significativos abiertos en los cambios asignados.

## Operación

Aplicar las tres migraciones incrementales de esta entrega antes de exponer el frontend nuevo. No reiniciar ni cargar fixtures en Supabase cloud. Las migraciones mantienen las validaciones de resultados observados, permisos privados e historial. El frontend anterior sigue leyendo sus prescripciones sin progresión.

La migración antigua `private_admin_portal` se renombró localmente de `20261005121930` a `20261005124032`, que es su versión ya registrada en cloud. Se comprobó equivalencia de SQL mediante SHA-256 normalizado y solo se reparó el historial local; no se volvió a ejecutar esa migración en producción.

La validación de emulación no reemplaza el uso en Android/iPhone físicos ni una clase real. Continúan los pendientes operativos anteriores sobre correo y respaldos externos. No se afirma ausencia universal de fallos ni se equiparan pruebas locales con una auditoría de datos productivos.
