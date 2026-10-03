# Verificación del MVP local

Fecha: 2026-10-03. Entorno: Windows, Node 24.19, Supabase CLI 2.119, Docker local, Chromium automatizado. URL: `http://127.0.0.1:5173`. Datos de prueba ficticios; credenciales y logs privados en `.local`, excluidos de Git.

## Resultado de la batería

| Comprobación | Evidencia |
|---|---|
| TypeScript | `npm run typecheck`, sin errores |
| Dominio, persistencia, aislamiento y recursos | `npm run test:unit`, 33/33 |
| Regresiones de la demo conservada | `npm run test:legacy`, 43/43 |
| SQL y permisos | `npm run test:db`, 23/23 |
| Flujos reales contra Supabase local | `npm run test:e2e`, 27/27 |
| Build y shell público versionado | `npm run build`, correcto |
| Dependencias | `npm audit`, cero vulnerabilidades informadas |
| PWA | `npm run test:pwa`, 2/2: arranque offline y actualización con pendientes |

Las pruebas incluyen acceso incorrecto, invitación de un uso, recuperación no reutilizable, usuario sin confirmar, alta pública deshabilitada, dos JWT y llamadas cruzadas a tablas/RPC/Storage. Comprueban publicación inmutable, cuatro semanas, copia y borradores incompletos, faltas sin reprogramar, cancelación, agenda recurrente, febrero/año nuevo y continuidad histórica.

Se probaron cinco alumnos simultáneos con pesos diferentes, edición y cambio inmediato de alumno, recarga offline, corrección de una serie en vivo, cierre explícito, respuesta perdida/reenvío sin duplicado, conflicto entre dos dispositivos y recuperación de otro mes sin modificar la rutina vigente. La escritura incompleta del detalle de series sobrevive navegación y recarga; un caso que antes fallaba pasó cinco ejecuciones seguidas después de corregirlo.

La simulación de cuota agotada comprueba error visible, ausencia de «Sincronizado» y bloqueo de cierre. Se inyectó un fallo SQL antes del recibo: alumno/revisión/auditoría se revierten juntos; el reintento funciona y el siguiente reenvío es duplicado.

## Interfaz y métricas

Login sin desbordamiento a 360, 390, 768 y 1440 px. Seguimiento móvil e historial a 390 px y constructor a 1440 px; capturas revisadas visualmente. Diálogo con foco y cierre por Escape, campos etiquetados y teclado numérico. Impresión muestra las cuatro semanas. La referencia al entrenamiento anterior se comprobó contra un resultado corregido real.

Volumen solo de series realizadas con carga/repeticiones; calentamientos, omitidos y tiempo quedan fuera. Las series por tiempo/repeticiones conservan su medida. Registros legacy son agregados y no se convierten en observaciones ficticias. CSV neutraliza fórmulas. Tabla y gráfico se derivan de los mismos registros de la página, con esa limitación visible.

## Carga y recuperación

La prueba crea temporalmente 5 entrenadores, 500 alumnos, 25 sesiones abiertas y 10 clientes. El archivo `.local/pilot-load-evidence.json` registra p95 y duración. Es una medición de Docker local, no una estimación de latencia de nube.

El ensayo de backup prepara alumno, rutina, sesión, dos series, auditoría e imagen privada. Cifra, restaura DB en destino aislado y recupera el objeto verificando hashes y permisos A/B. `.local/backups/restore-evidence.json` contiene conteos y duración. Las credenciales no se publican. Ver [alcance y límites del ensayo](ops/backup-restore.md).

Los 12 medios curados fijan commit de origen y SHA-256 por cuadro. Las pruebas verifican atribución y ausencia de contenido activo en SVG. El resto del catálogo no requiere medios remotos para funcionar.

## Lo que esta evidencia no acredita

- Vercel/Supabase remotos, envío SMTP ni configuración de producción.
- Respaldo externo automático, alerta remota, restauración completa de proveedor Auth o RPO/RTO productivos.
- Teclado, suspensión, instalación, almacenamiento y alarmas en Android/iPhone físicos; zoom nativo de los navegadores móviles.
- Una semana de uso por el entrenador, aprobación del catálogo ni publicación en tiendas.
- Recuperación de datos locales que el usuario o el sistema borren antes de sincronizar.

Estas puertas siguen en [piloto](ops/pilot.md), [despliegue](ops/deploy.md) y [transición móvil](mobile-readiness.md). No se declaran aprobadas por una simulación de escritorio.

## Revisión final

Se solicita una revisión independiente de toda la rama, con foco en autorización, atomicidad, cola, cambios de cuenta y conciliación histórica. Los hallazgos y su resolución se incorporarán aquí antes de cerrar la entrega.
