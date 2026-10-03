# Datos y privacidad del piloto

Solo los entrenadores tienen cuentas. Cada uno administra sus alumnos en un espacio privado; no existe un directorio público ni login para alumnos. Se guardan nombre, alias, notas, horarios, rutinas, ejecución y cambios. Las notas deben limitarse a lo necesario para el entrenamiento.

RLS y las funciones autorizadas verifican al dueño en cada operación. Las escrituras del entrenamiento son transaccionales, con revisión y recibo idempotente. El historial conserva autor, momento de captura, momento de confirmación y motivo de las correcciones. Los medios propios viven en Storage privado; las ilustraciones públicas incluyen origen y licencia por archivo.

En el dispositivo, IndexedDB se particiona por usuario/espacio. El navegador y el sistema operativo protegen ese almacenamiento; no constituye una bóveda cifrada separada. Al cerrar sesión sin pendientes se limpia la caché privada. El contenido público de la PWA permanece. El acceso offline se limita a 24 horas desde la última verificación y no transfiere pendientes a otra cuenta.

Ajustes permite exportar datos confirmados, descargar pendientes, importar explícitamente v6 y solicitar eliminación con verificación de contraseña. La solicitud **no elimina de inmediato**: el operador debe revisar identidad, obligaciones de retención, objetos, registros y backups. La auditoría no se puede editar directamente por API.

Antes de producción: aprobar aviso de privacidad, jurisdicción, responsables, retención, recuperación, proceso de eliminación y contratos de los proveedores. No usar información sensible real hasta completar esos acuerdos y los ensayos externos. No hay telemetría de nombres, notas, pesos o pulsaciones.
