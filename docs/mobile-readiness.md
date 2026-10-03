# Camino a Android e iOS

La entrega actual es web responsive e instalable como PWA. Dominio, contratos y cola están separados de React y del adaptador Supabase. No se generaron APK/IPA ni se publicaron tiendas.

Después del piloto web:

1. Prueba técnica de Capacitor en ambos sistemas: login/invitaciones/recuperación por deep link, teclado, navegación, safe areas y cierre de sesión.
2. Comparar IndexedDB del contenedor con un adaptador SQLite; usar almacenamiento seguro del sistema para credenciales. Migración de cola versionada, transaccional y por cuenta.
3. Verificar suspensión, reanudación, cambio de red, agotamiento de almacenamiento, temporizadores y cierre abrupto. El timer actual guarda un momento de fin; no promete una alarma en segundo plano.
4. Incorporar notificaciones, cámara o hápticos solo si el ensayo demuestra su necesidad. Revisar permisos y privacidad de cada plugin.
5. Preparar firma, cuentas de prueba para revisión, política de privacidad, eliminación de cuenta, TestFlight y pruebas internas Android. Publicación con autorización separada.

Si la prueba de Capacitor no alcanza la experiencia requerida, evaluar Expo reutilizando dominio/API y migración de datos. No prometer aprobación de tiendas ni reutilización íntegra de la interfaz sin esa prueba.
