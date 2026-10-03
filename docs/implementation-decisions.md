# Decisiones de implementación local

Fecha: 2026-10-03. Rama `codex/mvp-web-cloud`, base `3733f55`. El usuario autorizó ejecutar el plan y después indicó «Todavía no; avanzar primero en local» para Supabase/Vercel.

1. **Registro del plan en PowerShell.** Los subplanes usan identificadores A1–D4 y el script de seguimiento de la habilidad exige números. Se mantuvo un ledger manual equivalente y evidencia de comandos. Coste: el control de completitud necesita lectura humana.
2. **Bootstrap junto al login.** La creación autorizada e idempotente del espacio se adelantó dentro de A2/A3 para que el acceso tenga un destino real. Coste: las verificaciones de ambos pasos se ejecutan juntas.
3. **Worktree y puertos propios.** Se conservó la demo v6; app nueva en 5173, Supabase en 54341–54344. No se modificó el otro proyecto Docker encontrado en el equipo. Coste: hay dos aplicaciones locales claramente separadas.
4. **Entrega local, con puertas de salida externas explícitas.** No se crearon proyectos ni se contrataron servicios. Staging/producción, SMTP, copia externa programada, alertas remotas, Android/iPhone físicos y semana de piloto siguen pendientes. Coste: esta entrega no acredita disponibilidad ni recuperación de un servicio productivo.
5. **Invitaciones operativas locales.** Un script restringido a correos ficticios `@pulso.local` genera un enlace privado de un uso, sin envío. La invitación productiva exige operador y destino aprobados. Coste: todavía no hay alta por correo real.
6. **Catálogo inicial revisable e imágenes acotadas.** Se curaron nombres en español y 12 ilustraciones con origen, licencia y hashes fijados. Medios propios: imágenes PNG/JPEG/WebP privadas de hasta 5 MB. Video privado y validación presencial del catálogo se posponen al piloto. Coste: algunos ejercicios muestran un estado sin ilustración y no se pueden subir videos.
7. **Migración histórica conservadora.** Los registros v6 se preservan completos con su origen, sin inventar series observadas. Las rutinas importadas quedan en borrador; las sesiones antiguas abiertas permanecen identificadas para revisión. Coste: requieren revisión antes de usarlas como una nueva rutina/sesión.
8. **Exportación no equivale a reemplazo de cuenta.** JSON actual es una exportación consistente y verificable; el navegador no restaura un snapshot completo sobre la cuenta. El roundtrip probado corresponde a importación v6 idempotente y al respaldo operativo restaurado en destino aislado. Coste: una recuperación completa requiere el procedimiento del operador.
9. **Recuperación de otro mes exige revisión.** Un comando específico reproduce los cambios como ejecución histórica, conserva recibos/auditoría y cierra sin propagar a la rutina nueva. Si ya existe otra sesión abierta incompatible, se conserva el pendiente exportable para resolverlo. Coste: el caso incompatible no se resuelve automáticamente.
10. **Respaldo local con límites expresos.** Se restauró DB en una base aislada del clúster y medios en un bucket temporal, verificando hashes y permisos. No se reconstruyó un proveedor Auth remoto ni se configuró una copia externa diaria. Coste: el RPO/RTO productivo requiere un nuevo ensayo en staging.
11. **Componentes según responsabilidad real.** Progreso vive junto a historial; manifest/SW se generan en build; invitación y respaldo son scripts operativos. Se evitó crear directorios vacíos solo para reproducir el árbol propuesto. Coste: algunos nombres de archivos difieren del plan.

Las restricciones de integridad se mantienen: RLS por entrenador, comandos transaccionales, revisiones y deduplicación, series observadas inmutables salvo corrección auditada, pendientes por cuenta, cierre explícito y ningún aviso de sincronización basado solamente en estar conectado.

12. **Archivados es un flujo necesario.** El revisor lo etiquetó menor; se reclasificó importante porque sin filtro el entrenador no podía encontrar al alumno para restaurarlo. Se corrigió y probó. Coste si se sobredimensionó: un control y una regresión adicionales.
13. **Rama local conservada.** Se mantienen la rama y el worktree para seguir trabajando y probar la app. No se integra ni publica sin una solicitud de ese destino. Coste: los cambios nuevos están en este worktree, no en el checkout de la demo.


## Cambio solicitado el 2026-10-03: registro público e identidad visual

La solicitud posterior autoriza preparar despliegue en Vercel y reemplaza la decisión inicial de acceso solo por invitación. Registro público exclusivamente de entrenadores, email confirmado, una identidad por correo. El selector Alumno queda como Próximamente: las fichas existentes siguen siendo datos del entrenador. La misma identidad Auth debe usarse en una futura implementación de alumnos; la metadata editable nunca otorga privilegios. Se mantienen aislamiento, historial y persistencia del MVP.

Se reutilizan sin alterar los dos PNG entregados por el usuario: logo completo para acceso/navegación e isotipo cuadrado para favicon e instalación. El recorte de márgenes del logo se hace solo en la presentación CSS. Verde lima, blanco y negro, con texto oscuro sobre botones lima para contraste.

Quedan separados implementación local y activación cloud. CAPTCHA integrado pero requiere widget y enforcement de Supabase; SMTP real y proyectos cloud pendientes. No se promete seguridad absoluta ni MFA de entrenadores. Las credenciales administrativas permanecen fuera del frontend.


### Ajuste visual posterior solicitado

La paleta se aplica de forma completa en tema oscuro: negro #090909 de fondo, superficies neutras #161616/#222222, blanco #f5f5f5 y lima #adff35 para acciones y gráficos. Todos los colores de componentes viven en variables semánticas de styles.css; no quedan colores oliva/crema locales en componentes. Campos, autofill, selectores nativos, progreso, diálogos, catálogo, sincronización, agenda e historial usan el mismo tema. Error y pendiente conservan colores semánticos accesibles. La impresión usa blanco y negro; los SVG de ejercicios de terceros conservan sus originales y atribución.


El usuario prefirió después fondo blanco: el tema final usa blanco puro, texto negro, superficies gris neutro y lima original en acciones, selección y gráficos. Se conserva el negro del área de marca y navegación; enlaces y texto sobre blanco usan negro para legibilidad. Queda reemplazada la propuesta de tema oscuro.
