# Revisión visual del frontend — 4 de octubre de 2026

Se revisaron las rutas actuales de la aplicación en Chrome, con datos ficticios
en una cuenta aislada de Supabase local. No se modificaron datos de producción.

## Cobertura visual

- Ingreso, registro, recuperación, reenvío de confirmación, acceso de alumnos
  pendiente y enlace de recuperación no válido.
- Hoy, cinco entrenamientos simultáneos, incorporación rápida y reprogramación.
- Listado, alta, edición y ficha de alumnos, horarios y ficha sin rutina.
- Rutina vigente, constructor, semanas, bloques, descansos, selección de
  ejercicios y copia de una rutina del alumno al catálogo.
- Catálogo, búsqueda sin resultados, nueva plantilla, resumen y editor.
- Banco de ejercicios, creación y detalle sin ilustración.
- Entrenamiento en vivo, registro por serie, confirmación de cierre y pantalla
  sin sesión abierta.
- Mapa muscular, progreso con tres sesiones, gráfico, archivo de rutinas,
  valores archivados, registros y estados sin historial.
- Perfil, cambio de contraseña y centro de sincronización.

Vistas principales a 390 y 1440 px; comprobaciones adicionales a 320 y 768 px.
Las capturas son vistas de pantalla y secciones, no una imagen continua por
página. La galería local contiene 80 capturas finales en
`.local/frontend-audit/index.html`; las imágenes y la cuenta de prueba no se
publican en el sitio. Las secciones del archivo también se capturaron en móvil.
Las capturas de escritorio desplazadas que salieron incompletas por el motor de
captura se excluyeron de la galería. No se observaron desbordes horizontales de
la página en las vistas capturadas. Esto no sustituye pruebas en dispositivos
físicos iOS y Android.

## Correcciones

- Se limitaron los estilos del menú lateral a ese menú: antes también afectaban
  la navegación de semanas dentro de una rutina.
- Tamaños y etiquetas consistentes para casillas, botones, iconos y campos.
  Los botones deshabilitados se distinguen sin parecer acciones disponibles.
- Formularios y tarjetas se redistribuyen antes de quedar apretados en tablet.
  En celular se ven las cuatro semanas y las acciones del bloque sin solaparse.
- El registro por serie muestra unidades y el temporizador usa minutos:segundos.
  Los descansos del resumen de bloque se muestran en minutos.
- Gráfico adaptable con etiquetas legibles; archivo mensual en tarjetas móviles
  para evitar números partidos. Se reemplazaron colores antiguos por la paleta
  Pulso y se conservó el fondo blanco.
- Ventanas con fondo inmóvil, título y cierre separados; pantalla de recuperación
  y centro de sincronización consistentes con el resto de la aplicación.
- Al navegar se abre la nueva página arriba. Al volver a un entrenamiento se
  restaura su desplazamiento. El guardado de esa posición ahora ocurre antes de
  desmontar la pantalla: hacerlo después permitía que el navegador redujera el
  valor al tamaño de la pantalla siguiente.

## Verificación

- TypeScript: sin errores.
- 72 pruebas unitarias y 43 pruebas heredadas aprobadas.
- 46 pruebas E2E aprobadas, incluidas aislamiento entre cuentas, cinco alumnos,
  persistencia sin conexión, edición de rutinas, progreso y navegación.
- 2 pruebas PWA aprobadas: apertura sin conexión y actualización con cambios
  pendientes.
- Compilación de producción y comprobación de formato aprobadas.
- Nueva regresión automatizada para posición de navegación, regreso a una
  sesión y bloqueo/desbloqueo del desplazamiento en diálogos.

No hay cambios de esquema, políticas de acceso ni configuración de email en
esta revisión. Los estados de error de sincronización y recuperación también
están cubiertos por pruebas funcionales; no se fotografiaron todas las posibles
combinaciones de errores de red.
