# Incidentes de guardado

1. Leer el estado del alumno. **Sincronizado** exige confirmación del servidor. **Guardado en este dispositivo** conserva una operación durable pendiente; no es una copia en otro equipo. **Campo pendiente** puede ser texto incompleto.
2. Conservar el dispositivo y entrar en la misma cuenta. No borrar datos del navegador, desinstalar la PWA ni cerrar una sesión con cambios pendientes. Hoy → Datos y sincronización permite descargar la cola y reintentar.
3. Si otro equipo modificó el alumno, comparar valores. Aplicar el cambio revisado genera una operación nueva; conservar el remoto descarta explícitamente la cola de ese alumno. Una edición posterior dependiente no se aplica a ciegas.
4. Si cambió el mes, revisar y recuperar el entrenamiento en su mes original. Requiere motivo y cierre explícito; no modifica la rutina vigente. Si el servidor ya cerró la sesión o no hay una correspondencia segura, conservar la exportación y corregir los resultados individualmente.
5. Si falta espacio local, la transacción falla y se muestra el error. No afirmar que se guardó. Liberar espacio ajeno a la app, exportar lo disponible y reintentar; no borrar su base para liberar espacio.
6. Ante posible acceso cruzado, suspender el piloto, preservar evidencia sin credenciales y reproducir con cuentas ficticias. No compartir nombres, notas, valores o tokens en logs externos.

El centro de sincronización muestra cantidad y antigüedad de pendientes y necesidad de reintento. Los indicadores no contienen datos del entrenamiento. Después de cinco fallos automáticos el usuario puede reintentar manualmente. El lease entre pestañas puede demorar hasta 30 segundos en recuperarse tras el cierre abrupto de una pestaña; los recibos del servidor impiden duplicar la operación.

Para un incidente de servidor, seguir `backup-restore.md`. No restaurar sobre producción sin verificar un destino aislado. Asignar operador y canal de aviso antes del piloto; hoy no hay alertas remotas contratadas.
