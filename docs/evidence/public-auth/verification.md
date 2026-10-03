# Registro público e identidad Pulso — verificación 2026-10-03

## Resultado local

- Registro de entrenadores, confirmación por email desde otro navegador, botón explícito para consumir el enlace, reenvío y recuperación.
- Selector Entrenador/Alumno antes del formulario; Alumno muestra Próximamente y no envía solicitudes de acceso.
- Email único en Supabase Auth, incluso con mayúsculas y metadata de otro perfil. La UI no otorga permisos mediante metadata.
- Confirmaciones email y teléfono activadas para impedir enumeración por signup; alta por teléfono deshabilitada. Confirmación de email obligatoria antes de crear el espacio.
- Turnstile integrado y build Vercel bloqueado sin site key o con claves de prueba. Su validación servidor requiere configurar Supabase cloud; no se afirma que esté activa en producción.
- Logo e isotipo originales del usuario; tema final blanco puro, negro y lima en toda la UI. Fondo negro reservado al logo/navegación. Grises neutros, avisos semánticos e impresión legible en blanco y negro.

## Evidencia

- TypeScript y build: PASS.
- Unitarias: 40/40 PASS.
- E2E: 37/37 PASS. Incluye registro/duplicados, recuperación, aislamiento, historial y guardado en vivo.
- Base de datos pgTAP: 23/23 PASS.
- PWA final: 2/2 PASS (arranque offline y actualización con pendientes).
- Revisión visual después del último cambio a blanco: 6/6 PASS, 360/390/768/1440 px, rutina en móvil, constructor en escritorio e impresión.
- npm audit: 0 vulnerabilidades reportadas en la ejecución.
- Escaneo de clave administrativa y contraseñas locales conocidas en archivos versionables y bundle: sin coincidencias.
- Revisión independiente: hallazgo de enumeración corregido y revisado; sin hallazgos pendientes en esa corrección.

Capturas: login-mobile.png, login-desktop.png, training-mobile.png y builder-desktop.png en esta carpeta. Las fichas visibles son datos sintéticos de pruebas.

Se corrigieron dos condiciones de carrera en las pruebas existentes: esperar la descarga del alumno antes de cortar la red y respetar el vencimiento de 30 segundos de la concesión de envío después de una navegación interrumpida. No se alteró la lógica de persistencia por esos casos. Las suites E2E y PWA se ejecutaron por separado al verificar el resultado final, porque comparten cuentas locales.

## Pendiente externo

No desplegado. Se encontraron cuentas abiertas en Chrome: Vercel Joako_personal y Supabase joakopaco's Org. Esta última contiene joakopaco's Project y traza-inventario-tp6; falta que el usuario identifique el destino para Pulso. No se modificaron proyectos ajenos, no se contrataron servicios ni se subieron datos.

Restan proyecto cloud, SMTP/dominio de envío, Turnstile servidor, variables, migraciones y verificación sobre HTTPS real. Los correos locales se capturan en Mailpit; no llegan a emails reales. MFA de entrenadores no implementado. Las comprobaciones locales no equivalen a una auditoría externa ni a garantía de seguridad absoluta.
