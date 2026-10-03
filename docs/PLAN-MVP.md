# Pulso — plan de desarrollo del MVP

**Propuesta del 3 de octubre de 2026.** Primero una web práctica en celular y cómoda para administrar desde computadora. Después, aplicaciones Android/iOS sobre la misma cuenta y base de datos.

## Decisiones ya confirmadas

- Acceso únicamente para entrenadores.
- Un espacio privado por entrenador; alumnos sin cuenta.
- Piloto con uno, ampliación hasta cinco entrenadores.
- Hosting Vercel y backend Supabase.
- El centro del producto es atender a varios alumnos durante la clase.

## Recomendación

Construir React + TypeScript + Vite como web instalable. Conservar las reglas comprobadas de la demo, reemplazar scripts globales por componentes y sustituir la instantánea local por datos transaccionales en Supabase. Una cola local durable permite registrar sin red y sincronizar al regresar.

Android/iOS: validar Capacitor después del piloto para compartir la interfaz web. Si las necesidades nativas lo justifican, Expo puede reutilizar contratos y dominio; implicaría construir otra interfaz. La web administrativa seguirá disponible.

## Documentos

1. [Investigación y referencias](research/2026-10-03-referencias-producto.md): nueve productos/repositorios, hallazgos de código, visuales y licencias.
2. [Diseño del producto y arquitectura](superpowers/specs/2026-10-03-mvp-web-cloud-design.md): alcance, pantallas, datos, sincronización, seguridad, costos y salida a móvil.
3. [Plan de implementación y entregas](superpowers/plans/2026-10-03-mvp-web-cloud.md): dependencias, estructura, contratos y criterios.
4. [A — Cuentas y plataforma](superpowers/plans/2026-10-03-mvp-a-plataforma.md).
5. [B — Alumnos, catálogo y rutinas](superpowers/plans/2026-10-03-mvp-b-programacion.md).
6. [C — Seguimiento y sincronización](superpowers/plans/2026-10-03-mvp-c-entrenamiento.md).
7. [D — Migración, respaldo y piloto](superpowers/plans/2026-10-03-mvp-d-piloto.md).

## Entregas que se pueden revisar

| Entrega | Resultado visible | Condición de avance |
|---|---|---|
| A | Entrenador entra desde celular/PC y tiene su espacio | Pruebas de acceso cruzado pasan |
| B | Crea alumnos, ejercicios y rutinas; agenda visitas | Plantillas independientes, publicación y mes sin pérdida |
| C | Atiende cinco alumnos, edita y sincroniza | Recarga, cortes de red, reintentos y conflictos comprobados |
| D | Importa si corresponde, exporta, opera y recupera | Restauración probada, prueba real en ambos teléfonos y piloto acompañado |
| Después | Builds Android/iOS y pruebas en tiendas | Evaluación nativa y publicación como proyecto posterior |

## Tamaño y costo orientativos

Estimación propia inicial para A–D: **35–55 jornadas de ingeniería**, aproximadamente 7–11 semanas de trabajo de una persona a tiempo completo, más una semana de piloto acompañado. Incluye funciones recomendadas y pruebas; no es fecha comprometida. Reestimar al terminar A y al demostrar sincronización en C. No incluye publicación nativa ni funciones de la fase posterior.

Referencia de servicios: base desde **USD 45/mes** combinando Supabase Pro y una plaza Vercel Pro, más entornos, dominio, correo, objetos, uso e impuestos. Tarifas y condiciones consultadas el 03/10/2026 en [Supabase](https://supabase.com/pricing) y [Vercel](https://vercel.com/pricing). No se contrataron servicios. El presupuesto del usuario sigue sin definir.

## Qué revisar antes de empezar

Las propuestas que amplían la demo son: detalle opcional por serie, rangos numéricos más amplios, trabajo offline acotado y ruta PWA → Capacitor. El diseño explica la diferencia entre resultado observado y confirmado en modo rápido.

Para el respaldo se propone una pérdida recuperable máxima de 24 horas ante desastre de servidor y restauración en 4 horas, a medir en ensayo. Si se necesita una ventana menor, hay que presupuestar recuperación continua antes de usar datos reales.

La revisión de estos documentos no modifica la demo. No se crearon proyectos externos ni se publicó una nueva versión.
