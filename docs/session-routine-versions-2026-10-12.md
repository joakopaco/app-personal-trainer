# Actualización de la rutina al cerrar el entrenamiento

El seguimiento del personal trainer usa los resultados confirmados al finalizar para actualizar la rutina del alumno. Por ejemplo, una serie planificada con 25 kg que se registra con 50 kg pasa a mostrar 50 kg en ese día desde la semana entrenada en adelante. La versión anterior permanece intacta y se consulta desde Historial → Versiones de rutinas.

## Reglas de actualización

- El cierre, la revisión de rutina, el cambio de puntero y el recibo se guardan en la misma transacción. Hay como máximo una revisión por sesión; reintentos y cierres simultáneos no duplican versiones.
- Se comparan las mediciones de cada serie con su prescripción inicial. Los campos modificados pasan a las series correspondientes de las semanas siguientes. Una confirmación sin cambios conserva las metas diferentes que ya estaban previstas para semanas futuras.
- Cuando las series tienen distintas cargas o repeticiones, la rutina conserva esos valores como progresión. Se admiten rutinas anteriores con más de cuatro series; el editor sigue ofreciendo de una a cuatro.
- En ejercicios por tiempo, la última duración modificada y confirmada se convierte en la duración planificada. La rutina tiene una duración por ejercicio, no un campo por serie.
- Los descansos con alcance de semanas siguientes se acumulan durante el entrenamiento y se aplican al cerrar. Los descansos de esa sesión no se propagan.
- Se conserva la identidad del día y del ejercicio. Para semanas armadas por separado se admite la coincidencia única del ejercicio dentro del día correspondiente. Si se repite el mismo ejercicio y no hay identidad compartida, no se adivina una correspondencia.
- Las semanas anteriores, otros días, ejercicios omitidos y cierres sin cambios permanecen iguales. Las recuperaciones de meses anteriores y las correcciones históricas posteriores no reescriben la planificación vigente.
- Un borrador previo al entrenamiento se conserva. Al activarlo, la app permite revisarlo y combinarlo con la rutina actualizada antes de guardarlo y publicarlo.

## Historial y compatibilidad

Las revisiones incluyen `previous_revision_id` y `source_session_id`; no se crea otra rutina ni otro período. El historial muestra una tarjeta por rutina y un selector para consultar y exportar cada versión. Las renovaciones mensuales idénticas no agregan una versión visual redundante.

La migración `20261012235540_session_routine_versions.sql` es incremental y se aplicó en Supabase cloud antes del frontend. El archivo usa la versión registrada por el servicio; los cuerpos de las funciones coinciden con los probados localmente. Mantiene las funciones privadas sin permiso de ejecución para clientes y reutiliza los controles existentes de propietario, revisión del alumno e idempotencia. No modifica retrospectivamente entrenamientos cerrados.

## Verificación reproducible

`tests/e2e/session-routine-versions.spec.ts` cubre carga, repeticiones, duración, progresiones, legado de cinco series, semanas independientes, ejercicios repetidos, correcciones, omisiones, cierre concurrente, borrador pendiente y pérdida de respuesta seguida de recarga. Incluye consulta de las versiones anterior y nueva y comprobaciones visuales en 320, 390 y 1440 px.

También se ejecutan las pruebas existentes de seguimiento, recuperación mensual, borradores, historial, dominio y base de datos. Las pruebas usan alumnos ficticios y rechazan una URL distinta de la instancia local. La suite completa de CI valida una base nueva con todas las migraciones, además de los recorridos de gimnasio y entrenado.
