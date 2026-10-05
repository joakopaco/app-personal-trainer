# Operación de la modalidad gimnasio

Personal trainer conserva sus rutas, datos y comandos. Gimnasio usa tablas `gym_*` y `gyms`, sin compartir el workspace ni la lista de alumnos de un personal trainer. Editor, banco de ejercicios, temporizador, resumen, impresión, anatomía y cálculos de progreso reutilizan los componentes existentes mediante adaptadores.

## Habilitar el primer operador

El propietario debe indicar expresamente el email de una cuenta existente. Verificar esa identidad antes de insertar su `auth.users.id` en `public.platform_operators(user_id)`. No inferir el correo, no dar este permiso al primer usuario y no publicar una ruta de autorregistro de operadores. La tabla no admite escrituras de clientes. El rol es adicional: no convierte ni elimina la modalidad personal trainer.

Una vez autorizado, ingresar a `/administracion` o usar **Administrar gimnasios** desde Ajustes. Puede crear gimnasios, suspender/reactivar acceso y restablecer la contraseña de la cuenta administradora. El gimnasio solo puede crear y gestionar sus propios entrenados.

## Cuentas y credenciales

No hay autorregistro de gimnasios ni entrenados. La contraseña temporal se genera individualmente en `gym-accounts`, se muestra una vez y no se almacena en texto plano. Quien crea la cuenta entrega esas credenciales; el piloto no envía correos automáticos. Un email ya utilizado no se reasigna ni convierte.

El primer ingreso obliga a elegir otra contraseña. El servidor mantiene el bloqueo hasta completar el cambio y exige una sesión creada después del cambio/restablecimiento. El frontend reutiliza Turnstile en producción para la reautenticación. Si la respuesta del cambio se pierde, intenta verificar el resultado con la nueva contraseña.

Las altas conservan un identificador idempotente y una reserva temporal. Si se pierde la respuesta, reabrir el alta y reintentar recupera la misma cuenta. Si ya se completó y no se recibió la contraseña, usar **Restablecer acceso/contraseña** en la ficha; la contraseña original no se recupera. Suspender conserva rutinas e historial y revoca el acceso a datos aunque exista un JWT anterior.

## Rutinas y entrenamientos

El catálogo, las rutinas personalizadas y la rutina propia están separados. Una restricción de base permite una sola rutina propia por entrenado. Publicar crea una revisión inmutable; los borradores no sustituyen lo publicado. Las sesiones guardan su prescripción y revisión, por lo que los cambios posteriores no alteran su historial.

La edición pendiente se conserva por identidad y rutina/sesión en el dispositivo. Guardar reintenta el mismo comando si la respuesta se pierde. Ante cambios concurrentes se bloquea la sobrescritura. En entrenamiento, **Revisar versión guardada** permite descargar la edición local y cargar explícitamente el registro del servidor. Las operaciones de cuenta y el inicio de una sesión necesitan conexión; no se ofrece una falsa confirmación offline.

## Entorno local y publicación

Después del setup local existente, aplicar las migraciones incrementales y ejecutar `npx supabase functions serve`. El endpoint usa los secretos estándar del runtime de Supabase, nunca variables `VITE_*` administrativas. Las fixtures rechazan cualquier backend distinto de `http://127.0.0.1:54341`.

Orden de producción:

1. `20261005024453_gym_accounts.sql`.
2. `20261005024938_gym_provisioning.sql`.
3. `20261005025615_gym_routine_workflows.sql`.
4. `20261005032916_gym_access_hardening.sql`.
5. Desplegar `supabase/functions/gym-accounts/index.ts` con `verify_jwt=true`.
6. Publicar frontend mediante `main` y comprobar el commit en Vercel.

La función verifica además `auth.getUser`, el acceso vigente y permisos transaccionales. Las funciones de aprovisionamiento solo pueden ejecutarse con `service_role`. No desactivar RLS ni ampliar `owns_workspace`. Un rollback del frontend no requiere borrar estas tablas ni afecta los datos de personal trainer.

Verificación: unitarias/legacy, pruebas SQL existentes, E2E de personal trainer y gimnasio, aislamiento entre gimnasios, primer ingreso, altas, restablecimiento, suspensión, selección/propia única, historial inmutable, cortes de red, conflictos, capturas de escritorio y tamaños 320/375/390/820, motores WebKit y Chromium. La emulación móvil no sustituye una prueba en dispositivos físicos.

## Revisión final

Una revisión independiente identificó cuatro errores de recuperación: restauración de nuevas rutinas, idempotencia al guardar rutina, resolución de conflicto de sesión y respuesta perdida al cambiar contraseña. Cada uno tiene una prueba reproducible y corrección. Se agregó además una prueba de reautenticación con Turnstile para producción. Las evidencias de ejecución están en los informes locales de pruebas; nunca incluyen contraseñas temporales en capturas.
