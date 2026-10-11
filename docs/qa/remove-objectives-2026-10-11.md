## Eliminación de Editar objetivos · 11 de octubre de 2026

Se quitó el desplegable de edición masiva de objetivos del entrenamiento en vivo y sus estilos. El entrenador registra peso, repeticiones o segundos directamente en cada serie; se mantiene la referencia del ejercicio.

Las anotaciones locales que hubiera dejado el editor anterior permanecen visibles únicamente como recuperación: se pueden exportar antes de descartarlas para desbloquear el cierre. No se aplican ni se eliminan silenciosamente.

Validación: TypeScript, 143 pruebas unitarias, build, 11 E2E dirigidas y las 5 pruebas PWA aprobadas. Incluyen carga por serie, cambio entre cinco alumnos, cierre, recuperación de los cuatro tipos de objetivos anteriores, aislamiento de cuentas, falta de almacenamiento y sincronización tras recarga sin conexión. Revisión visual en Chrome con datos ficticios. Sin migraciones ni cambios en la conexión de producción.

La revisión posterior agregó 3 recorridos de navegación/corrección (14 E2E dirigidas en total). En GitHub, 99 de 100 E2E pasaron; el restante consultaba la eliminación de una plantilla antes de que terminara la petición. Se corrigió la espera para exigir que Reintentar eliminación esté habilitado y el caso pasó 5 repeticiones locales. El código de eliminación de plantillas no cambió.
