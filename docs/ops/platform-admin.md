# Administración privada de Pulso

## Acceso

- Página: https://app-personal-trainer-one.vercel.app/administracion
- Usuario del propietario: `AdminPulso123`.
- Login por usuario y contraseña, separado del login de clientes. Sin registro público.
- La primera contraseña se entrega privadamente; el primer ingreso exige reemplazarla antes de administrar gimnasios. No guardar credenciales en este documento ni en Git.
- La app de clientes mantiene `/login` y sus funciones de personal trainer y gimnasio.

## Separación

`main.tsx` selecciona el portal antes de montar AuthProvider/DataProvider de clientes. La URL administrativa usa la clave de almacenamiento `pulso-platform-auth`; el cliente conserva su clave original. La navegación administrativa no se sirve desde el service worker. Las API privadas no se cachean.

La separación visual y de almacenamiento no reemplaza permisos: `platform_operators` es administrada solo por el servidor. Sus identidades no pueden tener workspace de entrenador ni pertenecer a un gimnasio. `is_platform_operator()` exige cuenta activa, contraseña inicial reemplazada y una sesión real creada después de `access_after`. Cambiar contraseña, suspender o reactivar invalida la autoridad de sesiones previas.

El endpoint `platform-login` usa el resolvedor solo para service_role, límites atómicos de intentos y Supabase Auth con CAPTCHA. No emite correos ni divulga el identificador técnico en la UI. `gym-accounts` conserva verificación JWT y valida nuevamente permisos. El panel reutiliza el alta, suspensión, reactivación y restablecimiento de gimnasios existentes.

## Publicación

Se publica en el mismo proyecto Vercel `app-personal-trainer`, con `vercel.json` y `npm run build`. No necesita otro sitio ni otro dominio. Las variables públicas y el hostname del CAPTCHA del sitio actual se conservan. Nunca pasar una clave de servidor a Vite/Vercel frontend.

Aplicar la migración incremental `20261005121930_private_admin_portal.sql` antes de publicar. Desplegar `platform-login` con `verify_jwt=false` porque autentica las credenciales iniciales internamente; `gym-accounts` conserva `verify_jwt=true`.

Comprobar `npm run typecheck`, `npm test`, `npx playwright test`, `npx playwright test --config playwright.platform.config.ts`, `npm run build` y las pruebas PWA. Los fixtures crean identidades exclusivas y descartan sus cuentas de prueba.

## Alta privada y recuperación

Solo un operador de infraestructura autorizado utiliza Supabase Auth Admin API. Crear una identidad nueva con email técnico aleatorio en `operator.invalid`, email confirmado, contraseña aleatoria robusta y `app_metadata.platform_operator=true`; después insertar su UUID y username en `platform_operators` con `must_change_password=true`. Nunca promover un cliente. Entregar la contraseña inicial una vez mediante un canal privado. Retirar las copias temporales de claves de servidor después de usarlas.

Para recuperar la cuenta: suspender primero el operador (`active=false`), cambiar su contraseña mediante Auth Admin API y, al terminar, establecer `must_change_password=true`, `active=true` y `access_after=clock_timestamp()`. Suspender antes impide que exista una ventana de acceso durante el restablecimiento. El propietario ingresa de nuevo y reemplaza la temporal. No agregar un endpoint público de recuperación ni usar su cuenta de entrenador.

## Evidencia de seguridad

El servidor de producción rechaza ingreso sin CAPTCHA (`captcha_failed`). El diagnóstico de Supabase informa tablas privadas/operadores con RLS sin políticas: es intencional, deny-all para clientes. Las funciones definidoras autenticadas nuevas solo consultan al usuario de la sesión y validan su vigencia; las operaciones de servicio no están concedidas a clientes. La protección contra contraseñas filtradas del proveedor sigue sin habilitarse, como antes de este cambio.
