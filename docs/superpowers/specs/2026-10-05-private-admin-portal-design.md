# Portal privado de administración de Pulso

Estado: aprobado por el propietario el 5 de octubre de 2026; ejecución solicitada en esta conversación.

## Objetivo acordado

El propietario administra los gimnasios desde otra página, con un ingreso propio y una cuenta exclusiva. No ingresa por el login de clientes ni utiliza una cuenta de entrenador. El usuario solicitado es `AdminPulso123`; es un nombre de usuario, no una contraseña. Personal trainer y gimnasio conservan sus funciones y datos actuales.

## Separación del portal

Actualización explícita del propietario durante la ejecución: usar el mismo dominio y proyecto Vercel, con una página administrativa independiente en `/administracion`. Mantener login, sesión e identidad separados de los clientes.

El portal tiene su propia pantalla de ingreso, sesión y navegación. Solo solicita Usuario y Contraseña. No incluye registro público, selector de perfil, navegación de alumnos ni acceso a personal trainer. Mantiene la identidad visual actual de Pulso y adapta los formularios a escritorio y celular.

Retirar de la app de clientes el enlace de Ajustes y el montaje del panel en `/administracion`. La ruta `/administracion` monta el portal propio antes de los proveedores de clientes; no pasa por su login. La protección no depende de ocultar la dirección: cada consulta y acción sigue validando permisos en el servidor.

Alternativas consideradas: mantener el panel dentro del login de clientes contradice el pedido. Crear otro sistema de contraseñas y otra base agrega duplicación innecesaria. La propuesta separa las pantallas de ingreso y las identidades, reutilizando Supabase Auth y las operaciones administrativas existentes.

## Cuenta exclusiva y autenticación

Crear mediante un proceso privado la identidad de `AdminPulso123`. No promover ni convertir una cuenta de cliente existente. Normalizar espacios y mayúsculas del usuario para evitar problemas de escritura; la etiqueta visible conserva el nombre solicitado.

Supabase Auth sigue administrando las contraseñas. Si requiere una dirección interna como identificador, será una identidad técnica generada, oculta al propietario y sin envío de correo. No se pide ni se asocia el email de su cuenta de entrenador. No guardar contraseñas en tablas propias, código, logs, capturas ni repositorio.

El endpoint de ingreso recibe usuario, contraseña y comprobante CAPTCHA, resuelve la identidad técnica mediante una tabla privada y autentica con Supabase. Respuestas genéricas para usuario inexistente, contraseña incorrecta o cuenta inhabilitada. Aplicar límites de intentos en el servidor; la protección no depende solo del navegador. Las claves administrativas permanecen exclusivamente en el servidor.

Generar una contraseña inicial aleatoria, entregarla una sola vez al propietario y exigir su cambio en el primer ingreso antes de habilitar operaciones. No usar `AdminPulso123` como contraseña ni inventar que el acceso ya está habilitado. La recuperación se realiza mediante un procedimiento privado de restablecimiento, porque no existe correo de recuperación asociado.

## Permisos e identidades incompatibles

La pertenencia a `platform_operators` es la autoridad de permisos, administrada únicamente desde el backend. Rechazar una identidad operadora que ya sea dueña de un workspace de personal trainer o que pertenezca a `gym_accounts`. Bloquear también la creación posterior de esas asociaciones para un operador, incluso si está suspendido.

`ensure_workspace` rechaza identidades administrativas; no crea un espacio de entrenador durante su ingreso. El portal no monta los proveedores de datos ni almacenamiento offline de personal trainer. La aplicación de clientes no abre una cuenta administrativa como entrenador. Los permisos no se deducen de `user_metadata`, del nombre de usuario, del selector del login ni del hostname.

Separar el almacenamiento de sesión del portal y de la aplicación de clientes. Salir de uno no mezcla los datos ni reemplaza la sesión del otro. El panel requiere conexión y no guarda datos de gimnasios en un service worker.

## Funciones del panel

Reutilizar el panel existente para crear gimnasios, listar sus cuentas administradoras, suspender y reactivar gimnasios y restablecer acceso. Conservar los mecanismos de idempotencia, entrega única de credenciales y validación de permisos ya desarrollados. No añadir cuentas de entrenadores dentro del gimnasio ni modificar las reglas de sus entrenados.

Incluir un encabezado que identifique Administración de Pulso y un cierre de sesión visible. Los formularios muestran carga, resultado y errores dentro del contexto correspondiente. No presentar enlaces a pantallas de clientes como parte del panel.

## Publicación y verificación

1. Probar localmente la nueva autenticación y separación con identidades ficticias; ninguna prueba crea gimnasios reales.
2. Aplicar una migración incremental, con restricciones de identidades incompatibles y permisos mínimos. No borrar ni migrar datos de entrenadores.
3. Publicar los endpoints del portal y su página HTTPS independiente dentro del sitio actual, con el CAPTCHA del dominio ya autorizado, cabeceras de seguridad y variables públicas verificadas.
4. Publicar la página y retirar el acceso administrativo desde la navegación de clientes.
5. Aprovisionar la cuenta exclusiva solicitada mediante la operación privada y entregar URL y credencial inicial al propietario. No almacenar esa credencial en la documentación.

Comprobar ingreso correcto e incorrecto, cambio inicial obligatorio, cierre de sesión, revocación, rechazo de usuarios clientes, rechazo de asociaciones incompatibles, llamadas directas no autorizadas, aislamiento entre sesiones, creación y gestión de gimnasios, reintentos y errores. Verificar visualmente 320, 390, 768 y 1440 px en Chromium y WebKit. Ejecutar las pruebas de regresión de autenticación y personal trainer, typecheck y build. La prueba local no sustituye verificar el despliegue real y el CAPTCHA en su dominio.

Si el proveedor exige acceso externo para configurar el nuevo sitio o el CAPTCHA, informar exactamente esa dependencia sin desactivar protecciones ni reutilizar el login de clientes como solución provisional.
