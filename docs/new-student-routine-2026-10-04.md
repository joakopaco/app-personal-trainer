# Crear una nueva rutina para un alumno

Se recuperó el asistente de `routineWizard` del mockup (`app.js`): desde cero, plantilla, rutina vigente de otro alumno y rutina anterior del mismo alumno, con nombre editable y copia independiente de la base.

## Flujo

- Nueva rutina está disponible en la ficha del alumno y en el editor, incluso si hay un borrador.
- Desde cero permite elegir la cantidad de días; por defecto usa la asistencia configurada o un día si no existe horario fijo.
- Las rutinas anteriores incluyen Usar como base. Las opciones históricas usan la misma agrupación por rutina y fechas que el archivo del alumno.
- Si existe un borrador, abrir el asistente lo conserva. Reemplazarlo exige marcar la opción explícita, o se puede volver a él. Se reutiliza su identificador y revisión al guardar para evitar dejar una copia antigua que reaparezca tras publicar.
- El nuevo documento queda guardado localmente antes de mostrar el editor. Guardar borrador lo conserva en Supabase. Activar rutina reemplaza la vigente y conserva su historia; se mantienen los controles de conflictos y de entrenamiento abierto.
- Los nuevos documentos reciben identificadores propios de días, bloques, ejercicios y continuidad de series. La base no se modifica.
- Las consultas siguen usando Supabase con la sesión del entrenador y las políticas existentes de separación de cuentas. No hay cambios de esquema o permisos.

## Validación

- Prueba integral en Chromium y WebKit de las cuatro bases, cambio de nombre, vuelta al borrador, reemplazo explícito, guardado, recarga, activación, conservación de la rutina anterior e independencia de las fuentes.
- Regresiones de borradores, catálogo, guardado, entrenamiento y corrección de series.
- Typecheck y build de producción aprobados. Captura del asistente móvil en `.local/screens/new-routine/mobile-wizard.png`.
