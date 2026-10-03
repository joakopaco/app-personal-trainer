# SDD ledger — plan: docs/superpowers/plans/2026-10-03-mvp-web-cloud.md

2026-10-03: usuario autoriza ejecución, después confirma solo local; no proyectos externos creados.
Base 3733f55; branch codex/mvp-web-cloud en worktree existente. Baseline: 43/43 pruebas legacy.
Spec: docs/superpowers/specs/2026-10-03-mvp-web-cloud-design.md.
Ruling: usar ledger y briefs por subplan en PowerShell — los headings A1..D4 no corresponden al parser numérico del script bash — coste: control manual del registro, sin cambiar gates.
Pre-flight: A1→A2/A3 AccountScope; A3→B/C dispatcher, receipts, locks por alumno; B3→C1 snapshots/revisiones; A4→C2 guard real; C2→C4 cola inmutable; C5→D1 origen legacy. Contratos compatibles.
Ruling: A3 workspace bootstrap se implementa junto a A2 antes de su integración — login depende de espacio y el plan lo produce después — coste: commits coordinados, misma verificación A.
Tasks: A1 in progress; A2 A3 A4 B1 B2 B3 B4 C1 C2 C3 C4 C5 D1 D2 D3 D4 pending.
Gate externo: dispositivos físicos, SMTP/staging y semana de piloto no se pueden acreditar en este entorno; preparar y documentar sin simular evidencia.
A1 shell unit RED→GREEN; typecheck/build PASS; responsive unauthenticated e2e 4/4. A2/A3 integrated in d2104d3: pgTAP9/9; two-JWT adversarial test PASS; login/recovery e2e2/2. A2 pending invitation/operator and A4 guard. B1 domain RED 7 failing → implementation underway. Ruling: Pulso ports54341–54344 avoid unrelated Docker project; no service stopped. CLI2.119 uses JS executable (setup corrected).
## Checkpoint 2026-10-03 16:17 AR
A1 core done; A2/A3 real local Auth/RLS/receipts working, adversarial JWT test green, remaining invite/expired/unconfirmed coverage. A4 settings logout guard partial; account switching race review outstanding.
B1 typed domain tests21 incl numeric/routine copy, roster UI; B2 original curated names119 without media yet; B3 builder+monthlyimmutable publications; B4 schedule/visits and monthly backend basic. Templates/copy controls/draft comparison still needed.
C1 backend sessions+observed sets+quickclose+corrections: training e2e green. C2 Dexie transactions, stable UUIDv5 positions+sets, FIFO+lease/retry; unit23/23. C3 mobile happy path workflow e2e green. C4 conflict only discard/export UI; apply/reconcile/history import pending. C5 basic history and volume graph; metrics selectors/attendance pending.
D1 migration not started; D2 PWA/deploy pending; D3 backups pending; D4 final adversarial/multistudent/device tests pending.
Evidence: npm test 23 unit+43legacy; typecheck PASS; build PASS with chunks warnings to address; pgTAP9 PASS. auth2/security1/programming1/training1/mobileworkflow1/offline1 green individually. Offline test watched fail before Auth offline cache fix, then green: network blocked reload preserves42.5, oneaudit.
Ruling: preserve original demo; new app dev5173, Supabase54341/42/43/44. User confirms local only and asks to finish thoroughly. No full task completion claims yet.
Known cleanup: DataProvider close on StrictMode killed Dexie liveQuery (observed waiting screen) so removed close; need lifecycle generation guard and deferred safeclose, late async isolation tests. Raw field commit currently uses savedrevision, dependent outstandingACK may reject stale under fast edits; add test and fix. Current audit snapshot omits closed session so correct_result beforeafter needs dedicated capture. rawIncomplete routine blank after previousvalid must invalidate, not reuse old numeric. Limit and clean diagnostic files ignored .local.

## Checkpoint previo a revisión final
A1–C5 implementación local terminada y D1 import/export, D2 PWA/build, D3 ensayo local, D4 pruebas locales implementados. Gates externos siguen pendientes según docs/verification-mvp.md; no se marcan cumplidos por simulación.
Evidencia actual: typecheck/build PASS; 33 unit +43 legacy PASS; SQL23 PASS (incluye rollback inyectado antes del recibo); E2E27/27 PASS; audit 0 vulnerabilidades. PWA final en ejecución.
RED→GREEN adicionales observados: Storage ownership; Auth provider/signup mapping; raw quota indicador falso; borrador individual de serie perdido al navegar; indicador transitorio raw/outbox. Último caso de detalle pasó 5 repeticiones.
Ruling: entrega local acota gates externos — usuario confirma avanzar primero en local — coste: no se acredita servicio productivo ni móviles físicos.
Ruling: invitación operativa mediante script restringido local — evita crear correo/servicio externo — coste: invitación real depende de staging.
Ruling: imágenes privadas raster hasta 5 MB y catálogo inicial revisable; video diferido — alcance MVP multimedia opcional — coste: video y revisión presencial pendientes.
Ruling: importar v6 como fuente íntegra/draft y sesiones abiertas para revisión — no inventar resultados — coste: revisión manual antes de activación.
Ruling: exportar JSON actual sin restaurar toda la cuenta en navegador — restricción vinculante del diseño — coste: recuperación completa operativa, roundtrip actual de navegador no disponible.
Ruling: recuperación histórica explícita no pisa mes nuevo; otra sesión incompatible conserva cola exportable — una sola abierta por alumno — coste: resolución manual del caso incompatible.
Ruling: restauración local aislada no reconstruye proveedor Auth remoto ni copia externa — destinos no existen — coste: ensayo staging posterior obligatorio.
Ruling: distribución de componentes sigue responsabilidades, scripts operativos y SW generado — sin carpetas vacías — coste: rutas difieren del esquema sugerido.
Docs/implementation-decisions.md preserva estas decisiones con coste y contexto.

PWA final 2/2 PASS (35.4s), todos los gates locales ejecutados arriba.

Reproducibilidad: backup antes de reset (2 usuarios ficticios,0 alumnos,0 objetos); db reset desde cero aplicó001–014, setup-local y SQL23 PASS. Matriz guard build4/4 PASS: staging permitido, previewprod/secret/hostincorrecto rechazados. Prueba lifecycle concurrente PASS: sesión abierta pospone mes; dos clientes renuevan una sola vez e inician una única sesión.

## Revisión independiente completa
Reviewer /root/mvp_final_review, gpt-6-astra, contexto fresco, rango3733f55..1688e62: siete Important, cero Critical, un Minor. Se aceptan los siete (CAS raw, serie huérfana, cierre/rebase no revisado, identidad callback, selección plantilla, ordinal CSV, omitir vacío).
Final: Ruling: archivados inaccesibles se reclasifica Important — restaurar es una función necesaria y no se puede encontrar al alumno desde la interfaz — coste si se sobredimensionó: un filtro y una regresión adicionales.
Final: Ruling: gates externos que reviewer declinó siguen pendientes — alcance local explícito — coste: ninguna garantía productiva ni validación física/nativa hasta ensayo externo. Video privado permanece fase posterior documentada.
Regresiones RED observadas:5 unit (CAS, huérfana, finish/skip rebase, cierre con raw); history-series CSV ordinal y3review-ui (callbackdemorado,plantilla,omitirvacío). Correcciones en una pasada, luego suite completa.

Final: fixed CAS/borradores/huérfanos/cierre-rebase —5 unit RED→GREEN, unit38/38+legacy43/43.
Final: fixed callbackidentidad, plantilla, ordinalCSV, omitirvacío, archivados — regresionesUI RED→GREEN; E2E35/35 inclPKCE local y export/descarte raw; SQL23/23; build/typecheck PASS.
Final: minor (deferred): ninguno; el único minor se reclasificó y corrigió por impacto funcional.
Final: Ruling: conservar rama/worktree local — usuario pidió avanzar local; no hay solicitud de integración o publicación — coste: el checkout de la demo sigue separado.
PWA: se encontró carrera de test que navegaba antes de la recarga SW; esperado evento load explícito, repetición final en ejecución.

## Cierre local verificado
PWA2/2 PASS tras esperar navegación real, typecheck PASS. Total141:38unit+43legacy+23SQL+35E2E+2PWA. Build PASS, audit0, escaneo secretos PASS.
A1,A2,A3,A4,B1,B2,B3,B4,C1,C2,C3,C4,C5,D1: local scope complete (commits3733f55..1688e62 + finalfix, pruebas arriba); desviaciones y gates externos en docs/implementation-decisions.md.
D2: PWA y configuración local complete; publicación externa pendiente por alcance.
D3: ensayo local DB/Storage complete; respaldo externo/Authproyecto/RPO-RTO pendientes por alcance.
D4: aceptación automatizada y revisión/fixes locales complete; hardware físico y piloto real pendientes por alcance.
Final: fixed8hallazgos materiales de revisión; no menores diferidos. No segunda revisión: regresiones RED→GREEN y suite completa conforme al método.
