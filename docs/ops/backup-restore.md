# Respaldo y recuperación

## Qué está probado en local

`npm run backup:local` exporta Postgres completo mediante `pg_dump`, enumera y descarga los objetos de Storage y sus buckets, agrega hashes SHA-256 y configuración Auth. Cifra el paquete con AES-256-GCM. Solo admite Pulso local en `127.0.0.1:54341` / contenedor `supabase_db_pulso_mvp`.

El archivo cifrado, el índice y la clave de ensayo están en `.local`; no se versionan. En Windows, `mode: 0600` no configura ACL: la protección actual depende de los permisos del usuario y del disco. **Una clave guardada junto al backup no protege frente al robo de ambos.** En producción la clave debe estar en un gestor separado, con acceso y recuperación verificados.

`npm run restore:check` verifica autenticidad y hashes antes de restaurar. Crea una base `pulso_restore_<timestamp>` aislada dentro del clúster local, usa el rol local `supabase_admin` para restaurar funciones administradas y comprueba conteos y permisos. Recupera los bytes de medios en un bucket privado temporal y compara sus hashes. El `finally` elimina solamente esos destinos de ensayo, nunca la base fuente ni los archivos originales.

`tests/e2e/backup-restore.spec.ts` prepara un alumno, rutina, entrenamiento cerrado, series, auditoría y una imagen privada; confirma acceso del dueño y rechazo de otra cuenta, ejecuta respaldo y restauración, y limpia los datos ficticios. Evidencia: `.local/backups/restore-evidence.json`. El ensayo local tarda segundos; **no acredita el RTO de un proyecto remoto completo**.

## Límites del ensayo

- La app y Auth siguen conectados a la base fuente. Se restauran las filas de Auth y se comprueban permisos SQL, pero no se reconstruye otro proveedor Auth y se inicia sesión contra él.
- DB y archivos se capturan consecutivamente. Para un respaldo operativo coherente, suspender escrituras/cambios de medios durante la captura o implementar una estrategia de snapshots coordinados. La prueba lo hace con un dataset estable.
- Se recuperan archivos y metadatos; secretos del proveedor, dominios, SMTP, OAuth y claves de firma requieren inventario separado. La configuración local no contiene los futuros secretos remotos.
- No existe aún una copia externa diaria, alarma remota ni retención productiva configurada. Requieren destinos y presupuesto aprobados.

## Procedimiento productivo a habilitar

1. Copia diaria cifrada de DB y Storage a una cuenta/ubicación independiente; retención propuesta de 30 días. Clave separada. Registrar tamaño, hora, hashes, conteos y resultado; avisar al operador si falla o supera 24 h sin copia válida.
2. Objetivos propuestos, no garantías: RPO 24 h y RTO 4 h. Aprobarlos con el entrenador; si no alcanzan, presupuestar PITR y una frecuencia mayor.
3. Restaurar en otro proyecto, verificar versión SQL/extensiones, propietarios y permisos. Restaurar medios con rutas/buckets originales, políticas y créditos. Configurar Auth, SMTP, callbacks y secretos desde el inventario seguro.
4. Invalidar sesiones antiguas cuando corresponda; usar recuperación de acceso. Ingresar con dos cuentas y probar lecturas/escrituras cruzadas, historial, rutina, archivos y reintentos de operaciones.
5. Comparar conteos/hashes, registrar duración y último dato recuperado. Cambiar el destino de la app solo después de la aceptación. Conservar la fuente hasta cerrar el incidente.

La exportación JSON/CSV del entrenador sirve para portabilidad y revisión. No reemplaza este respaldo operativo. No se admite restaurar un JSON arbitrario sobre una cuenta desde el navegador.
