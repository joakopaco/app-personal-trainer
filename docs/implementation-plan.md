# Mockup de personal trainers

## Alcance aprobado
Pantallas estáticas responsive con datos ficticios. Agenda, alumnos y perfil mínimo, editor de ciclos de cuatro semanas, historial, métricas con períodos y vistas previas de rutina e informe. No hay backend, persistencia, cálculos deportivos ni exportación funcional.

## Implementación
- [x] Crear index.html, styles.css y favicon.svg: shell de escritorio con navegación lateral y adaptación móvil.
- [x] Crear data.js: ejercicios tomados del Excel como referencia, alumnos ficticios y doce meses de registros ilustrativos.
- [x] Crear app.js: renderizadores de pantallas y navegación entre estados de diseño. Los controles de negocio muestran estados de muestra, sin persistencia.
- [x] Mostrar reprogramación, confirmación con excepciones, edición desde semana 2, duplicación e historial como estados del mockup.
- [x] Mostrar selector de período y fechas, estado vacío y previews de PDF coherentes con la selección. Rutina completa de 4 semanas y 3 días de ejemplo; progreso separado.
- [x] Verificar sintaxis, navegación, vistas desktop y mobile, ausencia de desbordes y contenido de ambos documentos.
- [x] Documentar cómo abrir el mockup y sus límites en README.md.

## Decisiones visuales
Nombre provisional: Pulso. Verde bosque, superficies marfil y blanco, acento lima suave. Sidebar compacta, datos en tablas legibles, números grandes y jerarquía sobria. Tipografía de sistema sin recursos externos. Logo abstracto de pulso en SVG.

## Archivos y verificación
HTML/CSS/JS sin dependencias ni build. Abrir index.html directamente o servir con Python en localhost. Los previews de documentos forman parte del mockup y no generan archivos PDF. Verificar en 1440px y 390px, revisar agenda, editor, métricas, documentos y diálogos. Los datos son ficticios y están identificados en la interfaz.


## Revisión 2 solicitada por el usuario

La revisión 2 reemplaza la navegación y varios comportamientos de la propuesta original.

- [x] Agenda sin columna lateral ni actividad reciente. Confirmación por desplegables 0–150 kg, 1–4 series, 1–15 repeticiones.
- [x] Perfil con una rutina completa por alumno y rutinas anteriores. Sin bloque verde promocional.
- [x] Rutina y progreso dentro del alumno; banco de rutinas independiente. Historial global eliminado.
- [x] Flujo de creación de alumno y rutina desde cero, banco u otro alumno; copias independientes.
- [x] Biblioteca ampliada, arrastre nativo, alternativa móvil y entrada en calor editable. Sin RIR ni descanso.
- [x] Progreso por cambios de carga y grupos, con períodos e informe coherente.
- [x] Documentos con logo y plantilla fijos provisionales; RUTINA, nombre y fecha.
- [x] Verificación de 7 pantallas en 4 anchos y recorridos de creación, copia, edición, arrastre, confirmación y documentos.

Las nuevas interacciones trabajan en memoria para validar el flujo. La persistencia y el PDF real siguen fuera del alcance.

## Revisión 5 implementada

Se agregan rutinas actuales de solo lectura, borradores editables con activación explícita y archivo de la anterior, consulta histórica con contexto propio y guardado local en el navegador. El banco permite editar plantillas independientes. Se recupera la personalización global de documentos. Progreso incorpora mapa corporal interactivo, curvas por ejercicio, comparación antes/ahora y resumen visual por grupo. Estas decisiones reemplazan las limitaciones iniciales de ausencia de persistencia e interacciones; no se incorpora backend ni exportación real de PDF.
