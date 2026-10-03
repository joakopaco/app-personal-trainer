# Entornos y despliegue

El alcance autorizado es **local**. No se crearon proyectos pagos, no se publicaron datos y no se contrató infraestructura.

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

1. Crear proyectos Supabase separados. Configurar acceso por invitación, contraseña mínima de 12 caracteres, correo verificado, SMTP propio, URL principal y callbacks exactos `/auth/callback`. Deshabilitar registro público; verificarlo por API.
2. Revisar las migraciones SQL y aplicarlas primero en staging. Mantener RLS, permisos de funciones y bucket `exercise-media` privado. Solo el operador dispone de la clave administrativa.
3. Crear proyecto Vercel: raíz del repositorio, build `npm run build`, salida `apps/web/dist`. `vercel.json` incluye navegación SPA y cabeceras de seguridad. Configurar dominio HTTPS.
4. Variables públicas: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (anon o publishable). Variables de control de build: `PULSO_TARGET=staging|production`, `PULSO_EXPECTED_SUPABASE_HOST` y `PULSO_PRODUCTION_SUPABASE_HOST`. Una preview falla si intenta usar el hostname productivo, si falta la comparación o si lleva una clave administrativa.
5. Configurar secretos de migración solo en un entorno CI protegido. Invitar a entrenadores mediante el operador de Supabase; nunca exponer Admin API al frontend. Probar invitación, expiración, recuperación y repetición del enlace con el SMTP real.
6. Ensayar backup/restauración en un proyecto independiente. Aprobar proveedor, presupuesto, retención y responsables. Recién entonces habilitar un entrenador real.

No hay un workflow remoto que publique o migre automáticamente a producción. `.github/workflows/checks.yml` levanta Supabase local, prueba, construye y verifica PWA. Crear el workflow de entrega cuando existan los destinos aprobados; no inventar IDs ni secretos.

En CLI local, `[auth].enable_signup=false` bloquea las altas públicas; `[auth.email].enable_signup=true` mantiene habilitado el proveedor para entrar por email. Deshabilitar este último también bloquea el login en esta versión del CLI. Se verifican ambas conductas por API; [referencia del problema y aclaración oficial](https://github.com/supabase/supabase/issues/40582).

## PWA y rollback

`npm run build` crea un service worker con recursos públicos versionados. Auth y datos de alumnos no entran en Cache Storage; IndexedDB está particionado por cuenta/espacio. La actualización pide un punto sin pendientes ni borradores locales. Las pestañas existentes pueden conservar su versión hasta cerrarse; el servidor debe seguir siendo compatible.

Volver a un deployment anterior de frontend no revierte SQL. Usar migraciones aditivas y probar la versión anterior con el esquema nuevo. No borrar IndexedDB ni la outbox para forzar una actualización.

La instalación y los deep links de Android/iOS físicos siguen siendo una verificación externa pendiente. Un navegador de escritorio con viewport móvil no reemplaza ese ensayo.
