# Verificación del mockup

Revisión realizada con Microsoft Edge headless mediante Playwright, usando el servidor local en 127.0.0.1:4173.

- Sintaxis de `app.js` y `data.js`: correcta mediante `node --check`.
- Siete pantallas a 1440, 768, 390 y 360 px: sin desbordes horizontales del documento.
- Ningún error de JavaScript durante la revisión.
- Búsqueda de Lucía: un resultado; el enlace abre su perfil.
- Remo con mancuerna: 20 kg en semana 1 y 22 kg en semana 2. El diálogo explica la aplicación a semanas 2, 3 y 4.
- Informes de mes, seis meses, año y período histórico: mantienen el intervalo seleccionado y sus filas de ejemplo (5, 6, 12 y 3, respectivamente).
- Período personalizado fuera de las muestras: sin registros en métricas y en informe.
- Documento de rutina: cuatro semanas con tres días cada una, doce tablas de ejercicios.
- Diálogos de confirmación y reprogramación: apertura y cierre mediante Escape.
- Biblioteca móvil: apertura, selección de agregar y zonas de destino visibles.
- Inspección visual de agenda, editor y documentos en escritorio; editor, métricas e informe en celular.

## Límites

No se verificaron persistencia, drag-and-drop, cálculo de métricas ni generación de PDF: están expresamente fuera del mockup. Las imágenes de documentos son previews HTML conceptuales; los saltos de página de un PDF real requieren implementación posterior.


## Revisión 2 — verificación vigente

Microsoft Edge headless con Playwright. Siete pantallas revisadas a 1440, 768, 390 y 360 px, sin desbordes horizontales ni errores JavaScript.

- Agenda: tres destinos principales y sin panel lateral.
- Confirmación: ninguna casilla; 151 valores de peso, cuatro de series y quince de repeticiones. Confirmar 75 kg no altera la prescripción.
- Editar calentamiento en semana 2 modifica semanas 2–4 y conserva semana 1.
- Arrastre HTML nativo desde el agarre de biblioteca hacia la parte principal agrega el ejercicio.
- Alta de Marcos Pérez, copia de la rutina de Joaquín y edición a 90 kg: la rutina original conserva su valor.
- Rutina completa en cuatro secciones semanales, título RUTINA, nombre y fecha; sin RIR ni descanso.
- Rutinas anteriores de solo lectura; volver a la actual recupera controles de edición.
- Cuatro períodos de progreso conservados en el informe, con tarjetas por grupos y sin tablas de series.
- Período sin datos también vacío en el informe.
- Copiar una base de cuatro días desde el banco conserva los cuatro días y archiva la rutina anterior.
- En 390 px, agregar un ejercicio a aproximaciones desde el menú móvil funciona.

Inspección visual de perfil, progreso, editor, banco, agenda y confirmación en escritorio, y perfil/editor/progreso en móvil. Las limitaciones antiguas sobre ausencia de arrastre e interacciones de creación ya no aplican; estas funciones ahora operan en memoria. No hay exportación real ni persistencia.

## Revisión 5 — verificación vigente

Esta revisión reemplaza los comportamientos anteriores de activación inmediata y guardado únicamente en memoria.

Microsoft Edge headless con Playwright: ocho pantallas a 1440, 768, 390 y 360 px sin desbordes horizontales ni errores JavaScript.

- Abrir una anterior conserva el ID de la actual, muestra solo lectura y mantiene el contexto al recargar.
- Copiar crea un borrador; editarlo y recargar conserva el cambio sin modificar la actual.
- Activar exige el paso de revisión y archiva la anterior conservando su ID.
- Editar una plantilla del banco no modifica las copias personales.
- Guardar identidad visual persiste tras recargar y se refleja en el documento.
- Mapa corporal seleccionable con clic y teclado; modo Cargas contextualizado por ejercicio.
- Los cuatro períodos llegan intactos al informe; un intervalo sin datos queda vacío en pantalla e informe.
- Quitar ejercicios en móvil modifica solo el borrador.
- Inspección visual de progreso, borrador móvil y plantilla PDF.
- Sintaxis verificada con node --check para model.js, views.js, experience.js y app.js.

Los documentos siguen siendo vistas previas HTML. El guardado es local, sin backend ni sincronización entre dispositivos.
