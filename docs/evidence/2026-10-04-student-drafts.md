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

## Aplicación en producción

- El 4 de octubre de 2026 (Argentina) se aplicó la migración mediante el plugin Supabase al proyecto `dnsakonvrdwwmssftkpa`, confirmado como `app-personal-trainer`.
- El registro generado por MCP (`20261005022200`) se alineó con la versión ya versionada y probada en el repositorio: `202610050019`. La migración instala la función; no descarta datos existentes.
- Se verificaron la firma instalada, `search_path` vacío, ausencia de permiso de ejecución para `anon` y permiso para `authenticated`. Una llamada sin identidad fue rechazada correctamente.
- El asesor de seguridad no reportó errores. La advertencia sobre RPC `SECURITY DEFINER` accesibles a usuarios autenticados es intencional: la función valida identidad, propiedad, alumno y revisión. Referencia: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- También señaló la configuración existente de protección de contraseñas filtradas desactivada; no se modificó la configuración de autenticación en esta publicación. Referencia: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- El frontend se publica mediante el flujo habitual `git push origin HEAD:main`; verificar el estado de Vercel y los assets servidos antes de confirmar al usuario.
