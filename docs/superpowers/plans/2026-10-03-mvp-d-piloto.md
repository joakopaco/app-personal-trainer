# D — Migración, operación y piloto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: usar superpowers:executing-plans o superpowers:subagent-driven-development al ejecutar. Las pruebas de recuperación se hacen en destino aislado, nunca borrando producción.

**Goal:** Entregar una versión desplegable y recuperable, lista para un piloto con un entrenador.
**Architecture:** Entornos separados, migraciones versionadas, respaldo de DB/objetos y migración explícita desde v6.
**Tech Stack:** Supabase/Vercel, scripts TypeScript, Playwright, CLI y CI del repositorio.
**Spec:** [Diseño](../specs/2026-10-03-mvp-web-cloud-design.md); [contratos](2026-10-03-mvp-web-cloud.md). Depende de A–C.

## Global Constraints

- No reemplazar toda una cuenta mediante un JSON del navegador.
- Nunca mostrar «Sincronizado» por tener internet o recibir un evento Realtime.
- El piloto empieza con un entrenador; como máximo cinco inicialmente.
- Los objetos de Storage requieren respaldo además de la base de datos.

## Review Focus

Importación parcial/duplicada, subida accidental de datos ficticios, preview conectada a producción, backup que no restaura medios, service worker que borra la outbox.

## D1. Importación v6 y exportación

**Archivos:** packages/domain/src/legacy-v6.ts; scripts/import-v6.ts; apps/web/src/features/settings/{ImportPreview,ExportData}.tsx; supabase/migrations/*_import_jobs.sql; tests/fixtures/v6-*.json; tests/e2e/import-export.spec.ts.

**Consume:** backup v6 y contratos actuales. **Produce:** validateLegacyV6(), previewImport(), importJob(), exportWorkspace() con schemaVersion, hashes, conteos y procedencia.

- [ ] Fixtures válidas, rotas, versión futura, duplicados, sesiones abiertas, historial y referencias inválidas. Primer caso verifica conteos exactos.
- [ ] Construir mapa determinista por trabajo: identidad legada compuesta → UUID. Mantener documentos originales y registros agregados como legacy, sin inventar series ni horas.
- [ ] Vista previa requiere seleccionar espacio destino y confirmar que el archivo corresponde al entrenador. Identificar ejemplos; no subir la demo en onboarding.
- [ ] Importar idempotentemente por hash/espacio. Para el tamaño del piloto, validar límites antes y confirmar toda la importación en una transacción; si excede el límite, rechazar explicando cómo preparar lotes, no aplicar parcialmente.
- [ ] Exportar resultados y datos propios, nunca credenciales. Roundtrip en espacio vacío y repetir importación sin duplicar. Commit: feat/migration: preserve legacy records with explicit import.

Ruta especial para sesiones v6 abiertas: revisar contra sesiones existentes; si hay conflicto del mismo alumno, no crear otra abierta. Puede importarse cerrada solo con confirmación y reglas explícitas, o conservarse como pendiente de revisión.

## D2. PWA y despliegue reproducible

**Archivos:** apps/web/public/{manifest.webmanifest,icons}; apps/web/src/service-worker.ts; apps/web/src/features/settings/UpdateAvailable.tsx; vercel.json; .github/workflows/{checks,deploy-staging}.yml; docs/ops/deploy.md; tests/e2e/pwa-update.spec.ts.

**Consume:** build web y outbox. **Produce:** staging con HTTPS, instalación PWA y configuración productiva revisable.

- [ ] Pruebas de navegación directa a /hoy, recuperación de callback y arranque offline tras preparación previa.
- [ ] Cachear shell/recursos públicos versionados; datos privados solamente en caché particionada de la app. No cachear respuestas Auth ni PDFs/exports privados en caché global.
- [ ] Actualización de service worker avisa y espera un punto seguro; no activar a la fuerza durante una escritura. Migración IndexedDB transaccional y prueba con outbox anterior.
- [ ] Configurar Vercel root/build/rewrite para SPA y variables por entorno. Supabase staging separado; migraciones aplicadas por CI con secretos del entorno y revisión del diff SQL.
- [ ] Probar actualización durante sesión, rollback de frontend compatible y que preview no usa URL productiva. Commit: feat/deploy: add installable web app and isolated releases.

La publicación productiva y contratación se preparan como cambios revisables; ejecutarlas cuando el usuario autorice esos destinos y costos.

## D3. Respaldo, recuperación y observabilidad

**Archivos:** scripts/ops/{backup,verify-backup,restore-check}.ts; docs/ops/{backup-restore,incident-response,privacy}.md; apps/web/src/adapters/telemetry.ts; tests/integration/backup-restore.test.ts.

**Consume:** entorno aprobado, base y Storage. **Produce:** backup externo cifrado verificable, procedimiento de restauración y alertas.

- [ ] Definir dataset de ensayo con cuentas, rutinas, sesiones, auditoría y un medio privado. Preparar manifiesto de conteos/hashes.
- [ ] Configurar respaldo diario de DB y objetos, secreto fuera de Git, retención propuesta 30 días y monitoreo de ejecución. Inventariar Auth/configuración que el método elegido realmente permite restaurar; si sesiones/tokens deben invalidarse, incluirlo en procedimiento.
- [ ] Restaurar en proyecto aislado; reconfigurar políticas, secretos, Auth redirects y objetos. Entrar con una cuenta de prueba o flujo de recuperación, comprobar aislamiento A/B, conteos y hashes.
- [ ] Medir tiempo total y ventana de datos recuperados frente a RTO 4 h/RPO 24 h propuestos. Si falla, no declarar listo. Guardar evidencia sin datos personales.
- [ ] Implementar errores sanitizados, métricas de cola/confirmación y aviso operativo de backup fallido. Documentar exportación, borrado y retención. Commit: feat/ops: verify recovery and monitor data integrity.

No confundir el CSV/JSON descargado por el entrenador con respaldo operativo de todo Supabase. Un backup sin ensayo no cumple esta tarea.

## D4. Aceptación, piloto y transición nativa

**Archivos:** tests/e2e/pilot.spec.ts; scripts/load/pilot.ts; docs/verification-mvp.md; docs/ops/pilot.md; docs/mobile-readiness.md; README.md.

**Consume:** A–D3 completos. **Produce:** acta de salida con evidencias, instrucciones para piloto y alcance nativo posterior.

- [ ] Ejecutar suite DB/unit/e2e, build y verificación de secretos/licencias. Revisión independiente de autorización, transacciones y outbox según método de ejecución elegido; corregir hallazgos materiales.
- [ ] Probar 5 cuentas × 100 alumnos y 25 sesiones abiertas con dos conexiones por entrenador. Medir tiempos y separar errores reales de simulaciones de fallo.
- [ ] Android físico con Chrome/PWA e iPhone físico con Safari/PWA: teclado, touch, red cortada, bloqueo/reapertura, storage lleno simulado y nueva versión. Comprobar desktop 1440/tablet 768/móvil 360–390 y zoom.
- [ ] Registrar ensayo de cinco alumnos con el entrenador: abrir, consultar previo, cambiar valor, descanso, omitir, cerrar, corregir y revisar en PC. Corregir fricción observada antes de ampliar.
- [ ] Abrir piloto de una semana con un entrenador cuando haya autorización de producción. Revisar incidentes y respaldo diariamente; solo ampliar a cinco si no hay pérdida/acceso cruzado pendiente. Commit: docs/release: record acceptance and trainer pilot.

### Criterios de entrada para Android/iOS

El documento mobile-readiness.md incluye una prueba técnica separada, sin publicación automática:

1. Empaquetar build con Capacitor y comprobar login/deep links/teclado/safe areas en ambos sistemas.
2. Evaluar adaptador SQLite para caché/cola y almacenamiento seguro de credenciales; migrar desde caché web solo mediante mecanismo controlado.
3. Reanudar sesión y temporizadores tras suspensión. Definir plugins para notificaciones/hápticos/cámara únicamente si se necesitan.
4. Firmas, iconos, privacidad, cuenta demo para revisión, eliminación de cuenta, TestFlight y testing Android.
5. Medir experiencia. Si no alcanza, estimar interfaz Expo reutilizando dominio/API; no cambiar de tecnología sin ese resultado.

Esa fase no está incluida en las 35–55 jornadas ni garantiza aprobación de tiendas.

## Matriz mínima de aceptación final

| Escenario | Resultado exigido |
|---|---|
| Entrenador B usa ID conocido de A | Denegado en tablas, RPC, vistas y Storage |
| Dos dispositivos inician al mismo alumno | Una sola sesión abierta; segundo ve conflicto o la sesión existente |
| Reenvío de cierre por respuesta perdida | Un cierre y un conjunto de resultados |
| Cambiar de alumno durante guardado | Se escribe al alumno original |
| Edición de rutina desde PC durante sesión | Sin sobrescrito; publicación bloqueada/comparada |
| Recarga sin internet después de guardado local | Pendientes recuperados y claramente identificados |
| Usuario cambia de cuenta | No se muestran ni envían pendientes de la anterior |
| Sesión cruza mes y sincroniza tarde | Historia conserva período; no pisa rutina nueva |
| Cuota local agotada | Error visible; no confirma guardado inexistente |
| Backup restaurado | Datos y archivo recuperados con aislamiento correcto |
| Gráfico con cero registros | Estado vacío, no progreso inventado |
| Actualización PWA con outbox | Conserva pendientes y puede reanudar |

## Salida D

README distingue lo probado de lo pendiente y apunta a la versión desplegada. El usuario recibe URL, instrucciones de login, limitaciones offline, procedimiento de copia/recuperación y reporte de pruebas. Nunca credenciales o secretos en el repositorio.
