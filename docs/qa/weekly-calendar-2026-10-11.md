# Calendario semanal compacto · 11 de octubre de 2026

El acceso a Calendario es un botón cuadrado de 44 × 44 px con ícono, alineado con el título de Hoy. La grilla mensual se reemplazó por siete días en una sola fila, navegación por semanas y botón Hoy. Al seleccionar una fecha aparecen debajo sus alumnos, horarios y estados.

El panel usa una X para cerrar, controles de altura uniforme, un detalle desplazable y una acción secundaria compacta para abrir la agenda. Escape y el retorno del foco funcionan también con el cierre sin texto visible. Las consultas siguen siendo de lectura; no se crean turnos al navegar ni se cambia Supabase de producción.

Validación: TypeScript, build y 145 unitarias aprobadas; calendario en Chromium y WebKit a 1440, 390 y 320 px, cuatro regresiones de navegación/reprogramación y cinco PWA. Se revisaron capturas y el navegador con datos ficticios. Se cubren cambios de mes/año, año bisiesto, horarios habituales futuros, consultas fuera del intervalo descargado, X, Escape y Hoy. Sin migraciones.
