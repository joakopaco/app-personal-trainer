# Entornos y despliegue

El piloto usa Vercel `joako-personal/app-personal-trainer` y Supabase `dnsakonvrdwwmssftkpa`, creados por el usuario. URL: https://app-personal-trainer-one.vercel.app. Producción se actualiza desde `main` del repositorio `joakopaco/app-personal-trainer`. La configuración local no modifica automáticamente los proyectos cloud.

## Piloto sin envío de correo (decisión del usuario, 2026-10-03)

- Registro únicamente de entrenadores con email y contraseña (mínimo 12 caracteres). Supabase conserva una identidad única por email. Los alumnos siguen siendo fichas y su acceso muestra Próximamente.
- En producción `Confirm email` está desactivado y `VITE_AUTH_EMAIL_ENABLED=false`. Supabase autoconfirma el alta y devuelve una sesión: la app la conserva y abre el espacio privado. El frontend no concede permisos ni modifica `email_confirmed_at`; las políticas y RPC siguen verificando al usuario en el servidor.
- No hay SMTP propio, verificación de titularidad del correo ni recuperación automática habilitada en la interfaz. Conservar contraseñas. La recuperación manual requiere comprobar la identidad del participante con el operador; no conceder acceso solamente porque alguien declara un email. No marcar estos correos como verificados por su titular.
- Las respuestas duplicadas se presentan de forma genérica en la UI, pero Auth puede revelar que un email ya existe cuando la confirmación está desactivada. Turnstile y límites siguen habilitados; no afirmar resistencia completa a enumeración de cuentas.
- Turnstile Managed restringido a `app-personal-trainer-one.vercel.app`; secreto únicamente en Supabase Auth. Vercel recibe solo URL, clave publicable y site key públicos. Las siete variables son exclusivas de Production; las previews no pueden usar esta base.
- Las 15 migraciones iniciales se aplicaron en una transacción sobre el esquema público vacío y se registraron en `supabase_migrations.schema_migrations`. Nunca volver a ejecutar el bootstrap sobre una base usada: futuros cambios mediante migraciones incrementales.
- Para activar correo después: configurar SMTP y remitente verificado, activar confirmación, poner `VITE_AUTH_EMAIL_ENABLED=true`, aplicar el template de confirmación y probar alta/reenvío/recuperación. Las cuentas autoconfirmadas del piloto requieren un proceso explícito de verificación; activar el flag no verifica retroactivamente su titularidad.

Las siguientes instrucciones de correo describen esa fase posterior. El entorno local conserva confirmación y Mailpit para probar ambos recorridos sin depender de un proveedor real.

## Local reproducible

Requisitos: Node 24, Docker Desktop en ejecución y los puertos 5173, 54341–54344 libres. Desde la raíz del proyecto:

```text
npm ci
npm run db:start
npm run local:setup
npm run dev
```

Web: http://127.0.0.1:5173. Studio: http://127.0.0.1:54343. Correo de ensayo: http://127.0.0.1:54344. La demo anterior conserva el puerto 4175.

`local:setup` crea dos identidades ficticias y escribe credenciales en `.local/accounts.json`, ignorado por Git. Repetirlo rota sus contraseñas. No ejecutarlo contra una instancia remota: el script rechaza ese destino. Para otra invitación ficticia: `node scripts/ops/invite-local.mjs nombre@pulso.local`; el enlace privado se guarda en `.local/invites`, sin enviar correo.

`npm run db:reset` **borra la base local de este proyecto** y vuelve a aplicar migraciones. Solo usar para pruebas, después de exportar cualquier dato que se quiera conservar. No es un comando de actualización diaria. Para aplicar migraciones pendientes sin reiniciar: `npx supabase migration up --local`.

## Preparación de staging y producción

1. Crear proyectos Supabase separados. Habilitar registro por email de entrenadores, contraseña mínima de 12 caracteres y confirmación obligatoria. Desactivar login anónimo, teléfono y proveedores que no se utilicen. Configurar SMTP propio, URL principal y callbacks exactos `/auth/callback`. Copiar `supabase/templates/confirmation.html` al template Confirm signup: usa SiteURL y token_hash, funciona desde otro dispositivo y exige pulsar un botón antes de consumir el enlace. Mantener recuperación PKCE.
2. Revisar las migraciones SQL y aplicarlas primero en staging. Mantener RLS, permisos de funciones y bucket `exercise-media` privado. Solo el operador dispone de la clave administrativa.
3. Crear proyecto Vercel: raíz del repositorio, build `npm run build`, salida `apps/web/dist`. `vercel.json` incluye navegación SPA y cabeceras de seguridad. Configurar dominio HTTPS.
4. Variables públicas: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (anon o publishable) y `VITE_TURNSTILE_SITE_KEY`. Crear un widget Turnstile para los dominios exactos de cada entorno, guardar su secreto exclusivamente en Supabase Auth y habilitar allí CAPTCHA con proveedor Turnstile. No basta con mostrar un widget: probar que Auth rechace signup/login/reset sin token y con token inválido. El build Vercel rechaza claves de prueba o site key ausente. Variables de control de build: `PULSO_TARGET=staging|production`, `PULSO_EXPECTED_SUPABASE_HOST` y `PULSO_PRODUCTION_SUPABASE_HOST`. Una preview falla si intenta usar el hostname productivo, si falta la comparación o si lleva una clave administrativa.
5. Configurar secretos de migración solo en un entorno CI protegido. Nunca exponer Admin API al frontend. Probar alta, confirmación, reenvío, recuperación, expiración y repetición del enlace con el SMTP real, incluyendo apertura del email en otro teléfono. Desactivar tracking de enlaces en el proveedor SMTP. Los mensajes de alta y recuperación no confirman si otro usuario existe.
6. Ensayar backup/restauración en un proyecto independiente. Aprobar proveedor, presupuesto, retención y responsables. Recién entonces habilitar un entrenador real.

No hay un workflow remoto que publique o migre automáticamente a producción. `.github/workflows/checks.yml` levanta Supabase local, prueba, construye y verifica PWA. Crear el workflow de entrega cuando existan los destinos aprobados; no inventar IDs ni secretos.

## Seguridad y verificación previa a habilitar acceso real

- Un único proyecto Auth por entorno y una sola identidad por email, independientemente del perfil. La UI normaliza espacios y mayúsculas; Supabase Auth impide duplicar email. No crear otro proyecto Auth ni otra tabla de contraseñas para alumnos. Las fichas actuales de alumnos no son cuentas.
- El selector Alumno informa Próximamente y no ofrece login ni registro. El perfil no se manda como un permiso editable: `ensure_workspace` valida el usuario confirmado y crea su espacio de entrenador; no confía en `user_metadata.role`.
- Supabase conserva RLS por propietario, RPC con validaciones y Storage privado. Probar aislamiento con dos cuentas reales del entorno de staging y acceso anónimo antes del lanzamiento. Nunca ejecutar las fixtures locales contra producción.
- Confirm email y Confirm phone deben seguir activados, aunque el proveedor/signup por teléfono permanezca deshabilitado: Supabase requiere ambos flags para ocultar si un email ya existe en signup. Verificar por API que repetir un correo devuelve éxito genérico sin sesión ni nueva identidad; secure email change debe exigir confirmación en ambos correos. Activar las notificaciones de cambio de contraseña/email desde Supabase. Los enlaces duran una hora. Mantener rotación de refresh tokens y revisar sesiones ante incidentes.
- Activar MFA para operadores de Vercel, Supabase, repositorio y correo. La app todavía no implementa un segundo factor para entrenadores: no anunciarlo como disponible. La detección de contraseñas filtradas depende de la configuración/plan Supabase; activarla si está disponible y verificar su enforcement.
- Configurar límites en Supabase Auth para envío de correos, altas/login y verificaciones. Local: 30 solicitudes por 5 minutos, 60 segundos entre correos al mismo destinatario. Ajustar las cuotas SMTP del piloto sin desactivar CAPTCHA. Observar rechazos, errores y costes.
- Mantener los límites gratuitos/presupuesto acordado; no contratar suscripciones sin autorización. Vercel Hobby y proveedores pueden tener restricciones de uso: revisar el plan vigente para el piloto antes de elegirlo.
- Cabeceras en Vercel: CSP con scripts propios y Turnstile, prohibición de iframes de terceros que embeban Pulso, no-referrer, nosniff, HSTS y permisos restringidos. Las cabeceras se deben comprobar sobre la URL desplegada; Vite local no las reproduce.
- Ejecutar typecheck, pruebas de Auth/aislamiento, build y auditoría de dependencias. Verificar las variables sin imprimir secretos. Inspeccionar bundle y repositorio para evitar claves administrativas.
- Tener backup y restauración probados, dueño operativo y monitoreo. El ensayo local previo no demuestra recuperación cloud ni entrega SMTP.

El proveedor email debe seguir habilitado en `[auth.email]`; `[auth].enable_signup=true` habilita el alta pública. Reiniciar la instancia local para aplicar configuración Auth conservando volúmenes (`supabase stop` / `supabase start`); no hace falta borrar la base con db reset.

## PWA y rollback

`npm run build` crea un service worker con recursos públicos versionados. Auth y datos de alumnos no entran en Cache Storage; IndexedDB está particionado por cuenta/espacio. La actualización pide un punto sin pendientes ni borradores locales. Las pestañas existentes pueden conservar su versión hasta cerrarse; el servidor debe seguir siendo compatible.

Volver a un deployment anterior de frontend no revierte SQL. Usar migraciones aditivas y probar la versión anterior con el esquema nuevo. No borrar IndexedDB ni la outbox para forzar una actualización.

La instalación y los deep links de Android/iOS físicos siguen siendo una verificación externa pendiente. Un navegador de escritorio con viewport móvil no reemplaza ese ensayo.
