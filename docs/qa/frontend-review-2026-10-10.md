# Revisión de ergonomía y favoritos del 10 de octubre de 2026

Esta entrega corrige los problemas señalados en las capturas de escritorio e iPhone. Mantiene el alcance funcional de Pulso y continúa la revisión del registro de entrenamiento iniciada el 8 de octubre.

## Cambios comprobables

- Los días de rutina se presentan como Día 1, Día 2, etc., según su posición: editor, resumen, ficha, selección para entrenar, archivo e impresión. La agenda conserva los días reales de asistencia. Al copiar, duplicar, eliminar o mover días se renumeran los nombres persistidos de la semana afectada, conservando identidades, ejercicios y semanas intactas. Se retira el control de renombrado.
- Un único ejercicio completo por día es válido. La activación exige completar todos los días de las cuatro semanas. Antes, un error como «Martes: agregá ejercicios» no identificaba la semana y podía parecer contradictorio con el día visible; ahora indica «Semana 3 · Día 1». Un borrador incompleto deja de anunciarse como listo y muestra sus pendientes después de guardarlo.
- Copiar semana comparte la barra de semanas cuando hay espacio; al reducirse el ancho pasa debajo. El desplegable permanece dentro del editor y permite elegir destinos, cancelar y volver al disparador con Escape.
- Los tres controles del cronómetro tienen igual altura y áreas táctiles de al menos 44 px. En 320 px forman una fila debajo del tiempo.
- «Editar objetivos» explica su efecto sobre series pendientes; las series registradas conservan resultados. La referencia del ejercicio tiene su propio desplegable. Las progresiones no muestran un panel vacío de objetivos generales.
- La ficha usa cinco pestañas iguales y visibles: Ficha, Rutina, Borradores, Progreso e Historial. Sus rótulos accesibles incluyen el texto visible.
- CSV/PDF y acciones de biblioteca comparten altura. Los grupos musculares aprovechan el ancho del móvil; el gráfico muestra una sola fecha cuando todos los registros son del mismo día y abrevia fechas en anchos pequeños.
- Favoritos aplica la confirmación del guardado sin depender de una segunda consulta. Los errores de carga se muestran; los clics concurrentes se bloquean. Un cambio sin respuesta conserva su operación para reintentar tras recargar. El filtro «Solo favoritos» permite comprobar y usar la selección.
- Ajustes distribuye perfil y seguridad junto a guardado/conexión y ayuda offline/PWA. Muestra la cola real de envíos, conflictos y errores, permite reintentar y distingue red disponible de comunicación con el servidor. Los borradores no se presentan como sincronizados por tener la cola vacía.

## Verificación

La revisión incluye capturas y geometría a 320, 390, 768, 1024 y 1440 px; navegación manual en Chrome y pruebas automatizadas en Chromium y WebKit. Se recorren acceso, registro, recuperación, Hoy, alumnos, ficha, rutina, borradores, catálogo, editor, biblioteca, progreso, historial, exportaciones, Ajustes y contraseña. Los flujos compartidos de gimnasio, entrenado y administración se incluyen en la batería E2E.

Los datos usados para mutaciones son ficticios y pertenecen al backend local. Producción continúa usando Supabase cloud. Esta entrega no incorpora migraciones ni cambios de permisos de base de datos.

Resultados locales del código funcional `04ff5ff39a2b735f650ff5d2868eea43d5fb9f13`:

- TypeScript y build aprobados.
- 134 pruebas Vitest en 33 archivos, 43 legacy y 80 aserciones SQL en 6 archivos aprobadas.
- La primera pasada E2E completó 95 de 97 casos. Los dos fallos correspondían a Storage detenido en el backend aislado y al arranque en frío de las funciones de cuentas. Tras restablecer esos servicios, ambos pasaron. La pasada dirigida final aprobó sus 9 casos: esos dos, favoritos, cinco tamaños responsive y el nuevo caso de activación. Las cifras se superponen y no representan una única corrida de 106 casos.
- 12 de 12 recorridos móviles aprobados en Chromium y WebKit.
- 5 de 5 pruebas PWA aprobadas: arranque offline, conservación de datos, actualización sin interrumpir entrenamiento y separación de la administración.

La revisión independiente detectó renumeración persistida incompleta al duplicar días, rótulos accesibles discordantes, acciones de biblioteca de distinta altura y fechas superpuestas. Se corrigieron antes del commit funcional. La inspección manual adicional detectó un menú de copia que invadía el panel lateral a 768 px; se ancló al ancho de la barra y se agregó comprobación geométrica en los cinco tamaños.

La primera ejecución de GitHub Actions (`38106579684`) aprobó 97/98 E2E y detectó un solapamiento entre Semana 4 y Copiar semana en la rutina propia del entrenado a 1440 px. La barra reservaba 390 px para las pestañas aunque su contenido podía medir más. Se cambió la base flexible al ancho intrínseco del contenido para que Copiar semana pase a la siguiente fila cuando no entren ambos. El control geométrico del entrenador también incluye ahora los botones de gestión, además de los botones generales.

La corrección `70851a0be236e5fd8632bbdf7fe67cf2fd31ea58` aprobó los 8 recorridos dirigidos: cinco tamaños del entrenador y tres del gimnasio. El build, los 12 recorridos móviles completos y las 5 pruebas PWA volvieron a pasar. Una segunda revisión independiente del cambio no encontró hallazgos accionables.

Las pruebas responsive y de WebKit son emulación; no sustituyen una sesión en un iPhone o Android físico.

## Publicación y cierre del 11 de octubre

- [CI completa del código final](https://github.com/joakopaco/app-personal-trainer/actions/runs/38107381597): `completed / success`, con TypeScript, 134 unitarias, 43 legacy, 80 aserciones SQL, build, **98/98 E2E** y **5/5 PWA**. La ejecución corresponde a `70851a0be236e5fd8632bbdf7fe67cf2fd31ea58`.
- [PR #2](https://github.com/joakopaco/app-personal-trainer/pull/2) integrado en `main` mediante `995549f0a7d10d5973bc82d985512e3d1c76cf9f`. El árbol del merge coincide con el código verificado.
- Vercel confirmó **Ready / Production** para `dpl_3y7KJNbnLoGLGy8AJXiSRiXwiWXW`; su log de build identifica `main`, commit `995549f`, y el alias público `app-personal-trainer-one.vercel.app`.
- Se recorrió la web publicada con la sesión existente, en 1440 y 390 px: Hoy, alumnos, ficha, rutina numerada, borradores, biblioteca y filtro de favoritos, Ajustes. Se comprobó la distribución de escritorio y la navegación móvil mediante capturas. No se detectaron errores de consola. No se modificaron rutinas, registros ni favoritos reales; las mutaciones y los fallos de respuesta se verificaron en el entorno aislado.
- La PWA descargó la nueva versión; una segunda recarga aplicó el shell actualizado, preservando la sesión. El Supabase local de pruebas se detuvo al finalizar, con respaldo conservado.
- El Preview de Vercel mantiene su limitación previa: faltan sus variables públicas de Supabase. Producción tiene configuración separada y se publicó correctamente. No se copiaron credenciales productivas al Preview.
- La ejecución duplicada del evento `push` (`38107378506`) falló antes de integración por un puerto 54342 ocupado al arrancar Docker en ese runner. Se solicitó reejecución. La ejecución del PR citada arriba sí completó toda la batería del mismo código; la falla de infraestructura no se presenta como un fallo de aplicación ni como una prueba aprobada.

El Space Pulso Personal Trainer se actualiza con el alcance, decisiones, operación y evidencia de esta entrega. Se mantienen visibles sus pendientes previos de validación en teléfonos físicos y piloto real.
