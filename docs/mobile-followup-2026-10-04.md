# Segunda corrección móvil

Las capturas de un iPhone real mostraron que el control nativo de fecha seguía pintándose fuera del ancho, aunque las pruebas de tamaño en WebKit de escritorio pasaban. Se reemplazó su presentación por un marco propio, con texto de fecha e icono, que contiene el input nativo dentro de un área limitada. Se conserva el selector del dispositivo y los atributos de formulario. Se aplica a agenda, reprogramación, historial y filtros de progreso, con nombres accesibles explícitos.

El día de rutina ahora tiene un disparador con flecha que abre las opciones. La pantalla anterior usaba botones directos; cuando había un solo día, parecía un desplegable que no respondía. Ahora se aclara cuando solo hay un día configurado. No se inventan días que no estén en la rutina.

El entrenamiento muestra una barra superior persistente, con flecha de regreso a la izquierda y el nombre a la derecha. El selector entre alumnos se conserva cuando hay varios entrenando. Al cerrar ya no aparece el enlace Ver progreso.

## Validación

- Typecheck y build de producción aprobados.
- Cuatro pruebas móviles aprobadas en Chromium y WebKit: elección de Día 2 y comprobación de day_id en Supabase local, timer, alineación y permanencia de la barra al desplazar, cierre sin Ver progreso y diez pantallas a 320/375/768 px.
- Capturas revisadas en `.local/screens/mobile/`, incluyendo `webkit-phone-sticky-training.png`, agenda e historial.
- Siete pruebas adicionales aprobadas de reprogramación, geometría móvil/escritorio, cierre y persistencia de las series al navegar y recargar.

La emulación no sustituye la validación del selector nativo en un iPhone físico; la presentación nueva contiene ese control para que su borde y ancho no dependan de la apariencia nativa de iOS.
