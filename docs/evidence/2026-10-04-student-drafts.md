# Rutina vigente y borradores separados

- `/alumnos/:id/rutina` presenta exclusivamente la rutina vigente, con exportación y acceso explícito a editar o crear otra.
- `/alumnos/:id/borradores` lista las preparaciones locales y guardadas. El editor tiene una ruta propia y no selecciona la pestaña de rutina vigente.
- Abrir el editor no crea un borrador ni habilita Guardar. Volver a los valores guardados elimina la copia local redundante. Los valores incompletos se conservan.
- Descartar revisa la versión guardada y elimina únicamente el borrador elegido. La RPC comprueba propiedad, alumno y revisión; comparte el bloqueo del alumno con los comandos y admite reintentos.
- Guardar obtiene la revisión actual del alumno sin perder las comprobaciones de base y versión del borrador. Los cambios ajenos a la rutina no generan conflictos artificiales.
- Nueva rutina limpia los mensajes anteriores y presenta el formulario centrado. Las cabeceras mantienen su posición entre pestañas independientemente del orden de carga del CSS.

## Verificación local

- TypeScript y build de producción correctos.
- 73 pruebas unitarias y 41 comprobaciones pgTAP correctas.
- Primera ejecución E2E: 55/61. Se corrigió el margen de cabecera y se actualizaron las expectativas de navegación afectadas por la separación del editor. Reejecución de los archivos afectados: 15/15.
- WebKit iPhone y Chromium Pixel: 12/12, incluyendo guardado, descarte local y remoto, borrador desactualizado, selección de rutina, temporizador y banco de ejercicios.
- Capturas revisadas en `.local/screens/`: rutina vigente, formulario centrado de creación y versión móvil.
- Migración 202610050019 aplicada localmente sin reiniciar la base. El script transaccional de publicación se probó localmente y registra la migración de forma repetible.

## Publicación pendiente

No publicar el frontend antes de aplicar `202610050019_discard_student_draft.sql` al proyecto Supabase `dnsakonvrdwwmssftkpa`.
El script listo para el SQL Editor es `.local/deploy-student-drafts.sql`; no elimina datos al ejecutarse, solo instala la función y registra la migración.

No se aplicó en producción: la cuenta de Supabase CLI no tiene acceso a este proyecto, la conexión de Chrome carece de su registro nativo y Computer Use se detuvo al no poder determinar con seguridad la URL actual. No se modificó la configuración del navegador ni se ejecutó SQL remoto.
Después de confirmar la migración, publicar con el flujo habitual `git push origin HEAD:main` y verificar Vercel y los assets servidos.
