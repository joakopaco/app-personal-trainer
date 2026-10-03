# A — Plataforma y cuentas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: usar superpowers:executing-plans o superpowers:subagent-driven-development cuando se autorice ejecutar. Aplicar el ciclo prueba fallida → implementación → verificación → commit en cada tarea.

**Goal:** Un entrenador puede ingresar a su espacio desde web móvil/escritorio y no puede acceder a otro espacio.
**Architecture:** React/Vite independiente del dominio; Supabase Auth y autorización en Postgres.
**Tech Stack:** TypeScript, React, Vite, Supabase CLI, Vitest, Playwright, pgTAP.
**Spec:** [Diseño](../specs/2026-10-03-mvp-web-cloud-design.md); [contratos y restricciones globales](2026-10-03-mvp-web-cloud.md).

## Global Constraints

- Solo los entrenadores tienen login; los alumnos son fichas administradas por ellos.
- Cada entrenador tiene su espacio y sus propios alumnos.
- El piloto empieza con un entrenador; como máximo cinco inicialmente.
- Las claves privilegiadas nunca llegan al frontend.

## Review Focus

Cuenta confirmada sin espacio; redirects abiertos; recuperación de contraseña en otra sesión; datos de A visibles después de ingresar como B; grants/RPC que eviten RLS.

## A1. Base modular y shell accesible

**Archivos:** crear package.json/lockfile, apps/web/{package.json,index.html,vite.config.ts}, apps/web/src/app/{router.tsx,AppShell.tsx}, apps/web/src/components/{Button,Field,Status}.tsx, packages/domain/src/contracts.ts, vitest.config.ts, playwright.config.ts, .github/workflows/checks.yml. No modificar aún la demo raíz.

**Consume:** reglas y pruebas v6. **Produce:** workspace compilable y rutas /login, /hoy, /alumnos, /rutinas, /ajustes. AccountScope y contratos del plan maestro.

- [ ] Crear una prueba de render del shell y navegación por teclado; falla inicialmente al no existir componentes.
- [ ] Crear configuración mínima y scripts del plan maestro. Resolver versiones compatibles y registrar Node/CLI usados. Variables públicas únicamente en .env.example, sin valores reales.
- [ ] Implementar tokens de color/tipografía/espaciado y shell móvil con navegación inferior, escritorio con lateral. El selector activo todavía es un estado de ejemplo identificado.
- [ ] Ejecutar npm run typecheck, npm run test:unit, npm run build. Comprobar shell a 360/390/768/1440 px y zoom 200%.
- [ ] Commit: feat/platform: add typed web shell and verification pipeline.

Ejemplo de aceptación e2e una vez servido el shell:

~~~ts
await page.goto('/hoy');
await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
await page.getByRole('link', { name: 'Alumnos', exact: true }).click();
await expect(page).toHaveURL(/\/alumnos$/);
~~~

## A2. Acceso, invitación y recuperación

**Archivos:** apps/web/src/features/auth/{Login,Recovery,AuthCallback,AuthBoundary}.tsx; apps/web/src/adapters/auth.ts; supabase/config.toml; supabase/functions/invite-trainer/index.ts; tests/e2e/auth.spec.ts.

**Consume:** AccountScope/shell. **Produce:** getSession(), signIn(email,password), signOut(), requestRecovery(email), callback validado y SessionState = loading/authenticated/anonymous/expired.

- [ ] Escribir casos: credenciales incorrectas, invitación válida/vencida, email sin confirmar, recovery usado y redirect externo rechazado.
- [ ] Configurar Supabase local. Implementar login y recuperación con SDK; alta invitada del piloto y callback. No crear contraseñas propias en DB.
- [ ] Crear espacio idempotentemente al confirmar usuario; fallar de manera recuperable si el perfil/espacio todavía no existe. Pantalla «Preparando tu espacio» con reintento, no demo de otro usuario.
- [ ] Definir proveedor SMTP y plantillas en documentación; comprobar entrega en staging al preparar piloto. Función de invitación requiere operador autorizado y no queda accesible a cualquier entrenador.
- [ ] Ejecutar npm run test:e2e -- tests/e2e/auth.spec.ts y typecheck. Commit: feat/auth: add trainer login and recovery.

El correo no se envía durante planificación. El setup productivo incluye credenciales aportadas en el gestor de secretos, nunca en chat ni código.

## A3. Espacios, permisos y pruebas adversarias

**Archivos:** supabase/migrations/*_workspaces.sql, *_students_access.sql, *_command_dispatcher.sql; supabase/tests/{workspace_access,grants,command_receipts}.test.sql; tests/fixtures/cloud.ts; packages/domain/src/account.ts.

**Consume:** auth.uid() real. **Produce:** profiles, workspaces y students con relaciones compuestas y funciones owner autorizadas; operation_receipts, audit_events y apply_training_command(command jsonb) con validación, bloqueo de alumno, revisión e idempotencia. Incluye la RPC update_student inicial para editar nombre; B1 amplía la ficha y crea sus pantallas. Un user_id posee un espacio inicial.

- [ ] Escribir pgTAP para A/B/anon: leer, insertar, cambiar workspace_id y borrar por ID ajeno; probar también query filtrada deliberadamente por el ID de B.
- [ ] Crear tablas con PK/FK/checks, RLS y grants mínimos en la misma migración. Definir una función de comprobación de ownership sin recursión de políticas.
- [ ] Denegar escrituras directas en tablas auditadas; preparar RPC específicas. Revocar EXECUTE público por defecto en funciones privilegiadas y fijar search_path.
- [ ] Crear el dispatcher común con rechazo INVALID para comandos aún no implementados; no incluir un comando de prueba privilegiado en producción. Probar recibos/bloqueo con una actualización de ficha autorizada y luego B/C incorporan sus ramas. La RPC update_student comparte el mismo helper transaccional y revisión.
- [ ] Implementar fixtures locales. Prueba e2e con dos contextos autenticados; la respuesta no debe contener ni contar datos ajenos. Añadir prueba de view security_invoker cuando exista una vista.
- [ ] Ejecutar supabase db reset y npm run test:db. Commit: feat/security: isolate trainer workspaces in postgres.

Patrón a adaptar con tabla real y sesión Auth de prueba:

~~~sql
alter table public.students enable row level security;
revoke all on public.students from anon, authenticated;
grant select on public.students to authenticated;
create policy student_owner_read on public.students for select
to authenticated using (
  exists(select 1 from public.workspaces w
    where w.id = students.workspace_id and w.owner_user_id = auth.uid())
);
~~~

Una prueba que solo comprueba “la consulta no lanzó error” no valida aislamiento: comprobar cero filas para B y las filas exactas para A. Insertar un alumno se hará por una RPC autorizada de B1.

## A4. Ciclo de cuenta y aislamiento del dispositivo

**Archivos:** apps/web/src/features/auth/{SafeSignOut,SessionExpired}.tsx; packages/sync/src/account-scope.ts; apps/web/src/features/settings/AccountSettings.tsx; docs/ops/account-lifecycle.md; tests/e2e/account-switch.spec.ts.

**Consume:** sesión Auth, AccountScope. **Produce:** nombres de caché por userId/workspaceId, interfaz PendingWorkGuard y cierre que purga datos privados.

- [ ] Prueba: guardar caché A, salir e ingresar B; ninguna vista, buscador, outbox o callback debe devolver A. Intentar un callback viejo de A tras cambiar cuenta.
- [ ] Crear scope inmutable en operaciones asíncronas. Si cambia sesión, descartar resultados en UI de la cuenta anterior y cancelar sus consultas.
- [ ] Implementar guard de cierre con contrato hasPending(scope): Promise<boolean>, exportPending(scope): Promise<Blob>. Hasta C2 el adaptador devuelve false; C2 añade pruebas con cola real.
- [ ] Archivar y eliminar cuenta son flujos diferentes. Documentar borrado autenticado, limpieza de objetos y retención de respaldos; implementar solicitud de eliminación que revalide identidad, sin un endpoint público de borrado.
- [ ] Añadir CSP, revisión de secretos en bundle, rate limits de Auth y mensajes de error sin enumeración. Ejecutar auth + account-switch. Commit: feat/account: guard logout and isolate private device state.

## Salida A

La cuenta A entra desde dos pantallas; B no puede consultar sus datos con SDK directo. No hay service-role en bundle. El shell y CI funcionan; todavía no se afirma soporte offline de entrenamiento.
