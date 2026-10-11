# Segunda revisión de ergonomía · 11 de octubre de 2026

Se volvió a recorrer gimnasio y entrenado con los criterios acordados: registro directo por serie, controles uniformes, blancos táctiles cómodos, lectura clara, acciones cerca de los datos y conservación del trabajo.

## Hallazgos corregidos

- Al iniciar un descanso desde un ejercicio avanzado en una rutina larga, el contador quedaba arriba de la página. Ahora hay un solo temporizador y aparece junto al ejercicio o bloque que inició el descanso, con los mismos controles y persistencia.
- Los errores de una serie incompleta quedaban lejos del campo. Ahora se muestran en esa fila y están asociados a sus controles. Si Guardar o Finalizar detectan un dato inválido, la pantalla revela la fila correspondiente; el cierre del diálogo no vuelve a ocultarla.
- Al escribir `27,5` en el campo numérico nativo se podía guardar `275`. El registro acepta coma o punto decimal, selecciona el valor al entrar y conserva el texto incompleto en el borrador. La validación bloquea el guardado de una entrada inválida, sin sustituirla por el último número válido.
- Algunas capturas podían tomarse antes de terminar la carga. Las pruebas esperan ahora contenido específico de la pantalla antes de medirla y capturarla.

## Evidencia y alcance

Pruebas de interacción y revisión visual en WebKit y Chromium, a 320, 390, 768 y 1440 px. El escenario ampliado usa una rutina larga con doce series, nombres largos, descanso de 90 segundos, confirmación/corrección, errores al guardar/finalizar, coma decimal y recarga. Se verifican campos de al menos 44 px de ancho y 48 px de alto, texto de entrada de al menos 16 px, controles del reloj iguales y ausencia de desborde horizontal. Un viewport de 390 × 400 verifica que la fila enfocada no quede debajo del encabezado ni de la navegación.

Los recorridos de gimnasio incluyen ficha, edición, asignación, catálogo, copia, publicación, descarte, rutina propia, cuenta, progreso y exportaciones. La regresión también cubre conflictos, fallas de conexión y borradores. Las pruebas usan cuentas ficticias y se limpian al finalizar.

TypeScript aprobado; 178 pruebas unitarias y 43 legacy aprobadas. La evidencia de navegador final y CI se registra en el PR y en el Space.

Sin migraciones ni cambios al backend productivo. Producción continúa con Supabase cloud. La emulación y el viewport reducido no sustituyen una prueba de teclado, tacto y uso real en teléfonos físicos.
