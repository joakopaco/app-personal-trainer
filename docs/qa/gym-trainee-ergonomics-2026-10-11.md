# Gimnasio y entrenado · 11 de octubre de 2026

Se trasladan a gimnasio y entrenado las mejoras de presentación y ergonomía de personal trainer, conservando sus permisos y funciones: catálogo, rutinas personalizadas y una rutina propia por entrenado.

## Cambios

- Registro por filas de series, campos grandes de peso y repeticiones, confirmación visible, corrección explícita de series registradas y referencia del ejercicio. Sin edición de objetivos en el entrenamiento. Prescripciones progresivas conservadas al iniciar la sesión.
- Descansos del ejercicio y del bloque legibles y accesibles desde el temporizador; controles uniformes. Guardar y finalizar no se superponen a las series.
- Editor compartido con días numerados, máximo seis días por semana, copia de semanas junto a las pestañas, organización visible de días, presets y progresiones. La publicación indica semana y día incompletos; un ejercicio completo por día es suficiente.
- Borradores locales versionados: recuperación de textos numéricos inválidos, exportación, elección explícita ante versiones distintas, protección entre pestañas y reintentos con la misma identidad de operación. El acceso bloqueado a localStorage muestra una alternativa en vez de romper el editor.
- Una falla transitoria de actualización del acceso no desmonta una edición en curso. Se conserva la sesión mientras se ofrece reintentar la conexión. Los permisos siguen comprobándose en Supabase.
- Resumen con contadores exactos, ficha con navegación y acciones ordenadas, modales proporcionados y Ajustes/Mi cuenta en dos columnas en escritorio y una en móvil.
- Progreso con fechas locales, validación del intervalo, selector muscular coherente con los registros disponibles, identificación de día y semana, y exportación CSV con escape de fórmulas y valores cero preservados.

## Verificación

TypeScript y build aprobados. Pasaron 176 pruebas unitarias, 43 legacy, 80 SQL, 21 recorridos E2E de gimnasio/entrenado y 5 PWA. La suite móvil ampliada incluye WebKit y Chromium, tamaños 320–1440 px, recuperación de borradores, formularios, modales, permisos, registro, progreso y exportación.

Revisión manual en Chrome: resumen, entrenados, ficha, catálogo y vista de rutina, editor, ajustes de gimnasio, selección de rutina, entrenamiento por serie, finalización, progreso/exportación y cuenta del entrenado. Capturas y controles de desbordamiento/superposición complementan la revisión en móvil y escritorio. Datos ficticios en el backend local; las pruebas no modifican cuentas productivas.

Sin migraciones ni cambios de conexión de producción. Supabase cloud sigue siendo el backend publicado. Las pruebas locales no acreditan una prueba en un iPhone físico; esa validación y el piloto real siguen siendo comprobaciones operativas independientes.
