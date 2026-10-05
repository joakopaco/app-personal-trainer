# Revisión móvil de Pulso

## Cambios

- Inicio rápido: lista de alumnos con búsqueda y botones táctiles. La elección de alumno, semana y día ocurre dentro del diálogo; este flujo ya no depende del selector nativo de iOS. Incluye cambiar alumno, cerrar, estado sin coincidencias y protección contra envíos repetidos.
- Fechas: los controles nativos pueden reducir su ancho; Desde/Hasta pasan a una columna en teléfonos pequeños. La fecha de agenda dispone de una fila propia en pantallas angostas.
- Temporizador: tarjeta con reloj grande, reproducción/pausa, reinicio y +15 segundos. Sumar tiempo en pausa conserva la pausa. El estado se guarda por sesión en el almacenamiento local del entrenador y se restaura al volver al alumno o recargar. Un plazo absoluto evita que el tiempo dependa de la cantidad de intervalos ejecutados en segundo plano.
- El temporizador completa el intento de persistencia antes de mostrar un ajuste; una prueba de recarga inmediata detectó y corrigió una pérdida del último cambio en WebKit. Los errores de almacenamiento tienen un aviso explícito.
- Controles de 48 px en dispositivos táctiles; respeto de áreas seguras y altura disponible en diálogos y contenido sobre la navegación inferior.

## Evidencia y alcance

- Pruebas táctiles en Chromium y WebKit con perfiles Pixel 7 / iPhone 13.
- Revisión de diez pantallas principales a 320, 375 y 768 px, con campos de fecha vacíos y completos y formularios en 320 px.
- Prueba de llegada espontánea, inicio de sesión, pausa, incremento de 15 segundos, recarga inmediata, cambio entre dos alumnos, reinicio y final del descanso.
- Capturas en `.local/screens/mobile/` y revisión adicional de escritorio en `.local/screens/front-review/`. Solo se usaron alumnos de prueba en Supabase local.
- Ejecutar `npx playwright install webkit chromium` una vez y luego `npm run test:mobile` para repetir la revisión móvil.

WebKit en Windows permite verificar el motor y las interacciones táctiles automatizadas, pero no reproduce el selector nativo ni el teclado de un iPhone físico. No se atribuye una causa concreta a ese selector sin reproducirla en el dispositivo; el flujo afectado fue reemplazado por controles directos para evitarlo.

## Resultado final

- 73 pruebas unitarias aprobadas.
- 18 pruebas de flujos existentes aprobadas: agenda, reprogramación, alumnos, catálogo, rutinas, corrección de series, navegación, guardado sin conexión y separación de cuentas.
- 4 pruebas móviles aprobadas en la pasada final (dos por motor), incluyendo geometría de campos y ausencia de superposición entre botones.
- Typecheck, build de producción y revisión del diff sin errores.
