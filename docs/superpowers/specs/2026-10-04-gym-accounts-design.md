# Pulso para gimnasios — diseño funcional y técnico

## Objetivo y alcance confirmado

Incorporar una modalidad de gimnasio en la app existente, manteniendo su identidad visual y su ergonomía durante el entrenamiento. El usuario confirmó que personal trainer queda cerrado y conserva su funcionamiento. Se elimina únicamente la opción «Alumno · Próximamente» del login.

Se agregan cuentas de gimnasio y entrenado. Ninguna admite autorregistro. Un operador de Pulso crea el gimnasio desde una administración privada dentro de la app; el gimnasio crea a sus entrenados. No existen cuentas de entrenadores dentro del gimnasio.

Ambas cuentas ingresan inicialmente con email y contraseña temporal, y deben elegir una contraseña nueva antes de acceder a sus funciones. El entrenado puede elegir el catálogo de su gimnasio, usar una rutina personalizada asignada por su gimnasio o crear una única rutina propia editable.

## Decisiones propuestas para completar el flujo

- Una cuenta de gimnasio administra un único gimnasio. Un entrenado pertenece a un único gimnasio en esta primera versión. Los emails existentes no se reasignan automáticamente ni se convierten desde personal trainer.
- Hay una rutina seleccionada para entrenar. Las opciones del catálogo, las asignadas y la propia siguen disponibles para elegir. Cambiar la selección no borra registros anteriores ni modifica una sesión abierta.
- «Una rutina propia» significa un solo documento propio editable; las revisiones que permiten conservar historial no cuentan como nuevas rutinas propias.
- El gimnasio puede consultar la actividad y el progreso de sus entrenados. No puede consultar su contraseña nueva. Las anotaciones privadas administrativas no se exponen al entrenado.
- Los usuarios reciben sus credenciales de quien les da el alta. La contraseña temporal se genera individualmente y se muestra una única vez al creador. No se agrega envío automático de correo: el piloto actual no tiene SMTP propio habilitado.
- Dar de baja equivale a suspender el acceso, conservando rutinas y actividad. Reactivar vuelve a habilitarlo. Los cambios quedan auditados.
- El administrador del gimnasio puede restablecer el acceso de sus entrenados con una contraseña temporal nueva. El operador puede hacerlo para gimnasios. En ambos casos se exige nuevamente cambiarla y se revocan sesiones previas según el mecanismo de Auth soportado.
- La activación del primer operador requiere un email indicado explícitamente por el usuario. No se deduce de nombres, correos de commits ni del primer usuario registrado.

## Experiencia y navegación

### Ingreso

El selector ofrece Personal trainer, Gimnasio y Entrenado. El registro existente permanece disponible únicamente para personal trainer. Gimnasio y Entrenado explican quién entrega las credenciales y solo ofrecen ingreso. Los permisos efectivos se resuelven en el servidor; cambiar el selector o una URL no cambia el rol.

Al primer ingreso, gimnasio y entrenado solo ven «Elegí tu nueva contraseña», confirmación de contraseña y cerrar sesión. No pueden saltar esta pantalla mediante URL, otra pestaña, llamadas a la API ni una copia local de datos. El cambio se confirma en el servidor antes de habilitar el espacio.

### Administración privada de Pulso

Ruta `/administracion`, visible solo para operadores autorizados. Lista de gimnasios con nombre, email de administración y estado. Permite crear gimnasio, suspender/reactivar y restablecer acceso. El alta muestra su resultado y credenciales temporales una sola vez. Un fallo parcial no puede dejar un gimnasio accesible sin un administrador correctamente asociado.

El permiso de operador es independiente de la modalidad de la cuenta. Si el operador ya usa personal trainer, conserva ese espacio y obtiene un acceso adicional a administración.

### Cuenta de gimnasio

Navegación propia: Resumen, Entrenados, Rutinas y Ajustes. Conserva logo, colores, tipografías, tarjetas y navegación móvil de Pulso.

- Resumen: entrenados activos, rutinas publicadas y actividad reciente, con accesos claros a crear entrenado y crear rutina.
- Entrenados: búsqueda por nombre/email, alta con los datos personales pertinentes y gestión de acceso. Cada ficha separa información, rutinas asignadas, progreso e historial.
- Rutinas: catálogo exclusivo del gimnasio. Permite crear desde cero o copiar una existente, editar borradores, publicar y retirar del catálogo. Un borrador nunca aparece como rutina disponible para entrenar.
- Ficha de entrenado: asignar una rutina desde el catálogo o crear una personalizada con el editor actual. Las rutinas del catálogo y las personalizadas quedan identificadas por origen y fechas; no se presentan como meses.
- Ajustes: nombre del gimnasio, datos de la cuenta, cambio de contraseña y cierre de sesión.

### Cuenta de entrenado

Navegación propia: Entrenar, Rutinas, Progreso y Mi cuenta.

- Entrenar: rutina elegida, selección de semana/día y comienzo o continuación de entrenamiento. Registro de series, carga, repeticiones o tiempo, descanso visual, pausas y finalización.
- Rutinas: categorías «Del gimnasio», «Personalizadas para mí» y «Mi rutina». Tarjetas con nombre, origen, detalle y acción explícita para seleccionar. No recibe acciones de administración del catálogo.
- Mi rutina: crear y editar un único documento propio con el banco de ejercicios por músculos, arrastrar y agregar por botón. Guardar y seleccionar son acciones diferenciadas. Una segunda creación concurrente no puede superar el límite de una rutina.
- Progreso: figura muscular, gráfico de evolución, filtros por ejercicio y exportación, basados únicamente en sus resultados. Historial de entrenamientos y rutinas usadas, conservado al cambiar de rutina.
- Mi cuenta: identidad y gimnasio asociado, cambio de contraseña y cierre de sesión. No puede editar su gimnasio, email de asociación ni rol desde el cliente.

La cabecera del entrenamiento conserva la flecha izquierda y nombre a la derecha; temporizador y controles táctiles mantienen el diseño ya aprobado.

## Arquitectura propuesta

Mantener una app React y un proyecto Supabase por entorno. Agregar módulos de gimnasio con tablas y comandos propios, reutilizando el esquema de rutinas, validaciones, cálculos y componentes visuales. No otorgar al entrenado la propiedad de un workspace de personal trainer ni ampliar `owns_workspace` para incluirlo.

La alternativa de convertir toda la app al modelo gimnasio contradice la confirmación del usuario. Una app y una base separadas duplicarían editor, diseño y mantenimiento sin aportar una necesidad funcional en esta etapa. Se elige una modalidad separada dentro de la app, con autorización explícita en servidor.

### Identidad y autorización

- Supabase Auth continúa siendo la única fuente de identidades y contraseñas.
- Roles de gimnasio, membresía, suspensión y obligación de cambiar contraseña se guardan en tablas protegidas. No se confía en `user_metadata`, el selector de login ni parámetros enviados por el navegador.
- Tabla de operadores separada, sin escrituras desde cuentas normales. El alta inicial se realiza de forma controlada sobre el usuario indicado por el dueño.
- Un resolvedor de acceso autenticado devuelve modalidad, gimnasio, identidad de miembro y estado de acceso. No crea automáticamente un workspace de entrenador para una cuenta de gimnasio o entrenado.
- Las altas y los restablecimientos usan una función de servidor con Admin API. Ninguna clave administrativa se incluye en Vite, navegador, logs o exportaciones.
- El cambio inicial utiliza un endpoint verificado: valida la sesión y estado pendiente, cambia la contraseña mediante Auth y confirma el desbloqueo desde servidor. Un fallo conserva el bloqueo y permite reintentar; el cliente no puede marcarlo como completado.
- Suspensión y cambio obligatorio se verifican en cada lectura/escritura protegida, también con un JWT emitido antes del cambio. Las cachés se separan por identidad/modalidad/gimnasio y no sustituyen estas comprobaciones.

### Datos

Entidades nuevas: gimnasios, acceso de cuentas de gimnasio, miembros, operadores, rutinas del gimnasio, revisiones de rutinas, asignaciones/selección, rutina propia única, sesiones y resultados de miembros, auditoría de administración y solicitudes de aprovisionamiento.

Cada entidad dependiente incluye `gym_id`; relaciones compuestas impiden mezclar gimnasio y miembro o gimnasio y rutina. RLS limita consultas por gimnasio y, en el caso de miembros, por identidad propia. Las escrituras se realizan con comandos acotados, revisiones e idempotencia.

La documentación de rutina usa `RoutineDocument` existente. Publicar crea una revisión inmutable. Una sesión registra la revisión y una instantánea de su prescripción: editar, retirar o reasignar una rutina no altera resultados ya registrados. Un índice único garantiza una sola rutina propia por miembro y una sola sesión abierta.

Seleccionar un catálogo copia o referencia una revisión publicada de forma explícita y estable. Una actualización posterior no reescribe la actividad personal ni cambia una sesión iniciada. Una rutina retirada deja de ser elegible para nuevas selecciones; los datos históricos se conservan.

### Componentes existentes

Reutilizar `RoutineFields`, `ExercisePalette`, `RoutineSummary`, formatos de descanso, `RestTimer`, figura anatómica, cálculos y exportación. Cuando una vista depende de consultas de personal trainer, extraer únicamente su presentación o añadir adaptadores con el comportamiento actual como valor por defecto. No permitir que una consulta de gimnasio recorra los datos de personal trainer.

Rutas nuevas bajo `/gimnasio/*`, `/mi-entrenamiento/*` y `/administracion/*`. Las rutas actuales de personal trainer conservan URLs y comportamiento. El layout se resuelve por modalidad; ninguna sesión de entrenado monta el proveedor que enumera todos los alumnos del entrenador.

## Casos de fallo que deben quedar resueltos

- Doble clic o reintento de alta no crea dos cuentas ni dos asociaciones. Un email existente se informa sin reasignarlo.
- Un alta Auth exitosa seguida de error de asociación queda bloqueada y recuperable por el mismo proceso; no se elimina arbitrariamente una identidad preexistente.
- La contraseña temporal no se vuelve a consultar. Si se pierde, se genera otra mediante restablecimiento autorizado.
- Un administrador de otro gimnasio y un entrenado distinto reciben denegación aunque conozcan los UUID.
- Dos pestañas no sobrescriben versiones nuevas ni crean dos rutinas propias.
- Cerrar sesión elimina el acceso visual a datos de la identidad anterior. Perder conexión durante una serie conserva lo escrito y muestra con precisión si sigue pendiente.
- Suspender gimnasio o miembro bloquea acceso nuevo y posterior uso de una sesión existente sin destruir historial.
- Descartar un borrador no elimina una rutina publicada; borrar o retirar una opción no elimina entrenamientos.

## Verificación y entrega

Pruebas de permisos entre dos gimnasios y dos miembros, primer ingreso obligatorio, alta/restablecimiento/suspensión, rutina propia única, selección de los tres orígenes, historial inmutable y recuperación de fallos de red. Recorrido E2E de operador → gimnasio → entrenado con identidades locales ficticias.

Capturas y comprobación de interacción de login, cambio de contraseña, administración, alta, catálogo, editor, ficha, selección, entrenamiento, progreso y diálogos en escritorio, 320/375/390 px y tablet. Revisar desbordamientos, foco, teclado, botones y contraste.

Ejecutar las regresiones de personal trainer además de las nuevas pruebas; no basta con comprobar las pantallas nuevas. Desplegar primero migraciones y endpoints compatibles, luego frontend. Las cuentas reales no se crean como fixtures de prueba. No se borra ni convierte información existente.

## Estado

Diseño aprobado por el usuario e implementado en una modalidad independiente. La verificación y el despliegue se documentan en `docs/ops/gym-accounts.md`. La habilitación del primer operador en producción requiere el email que indique el usuario.
