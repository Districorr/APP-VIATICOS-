\# Changelog Técnico - InfoGastos Districorr



Este documento registra los cambios técnicos significativos realizados en el proyecto.



\---

\### 2026-05-13

\- \*\*Feature:\*\* F-LOG-001 - Gastos a Cuenta Corriente de la Empresa.

\- \*\*Archivos Afectados (Frontend):\*\*

&#x20;   - `src/components/GastoForm.vue`

\- \*\*Documentacion Afectada:\*\*

&#x20;   - `DOCUMENTACION/FEATURE_SPECS/FEATURE_SPEC_F-LOG-001_CUENTA_CORRIENTE_EMPRESA.md`

&#x20;   - `DOCUMENTACION/FRONTEND_ARCHITECTURE.md`

&#x20;   - `DOCUMENTACION/FRONTEND_BACKEND_DATA_FLOW.md`

&#x20;   - `DOCUMENTACION/CURRENT_IMPLEMENTATION_STATUS.md`

&#x20;   - `DOCUMENTACION/PROJECT_CONTEXT_MASTER.md`

\- \*\*Backend Afectado:\*\*

&#x20;   - No aplica. No se crearon tablas, columnas, RPCs, triggers, views ni SQL.

\- \*\*Comportamiento:\*\*

&#x20;   - Se agrego la opcion `A Cuenta Corriente de la Empresa` en el Paso 1 de `GastoForm.vue`.

&#x20;   - El flujo no solicita rendicion, caja diaria ni receptor de delegacion.

&#x20;   - El payload se envia con `origen_gasto = 'cuenta_corriente_empresa'`, `estado_delegacion = 'directo'`, `viaje_id = null`, `caja_id = null` y `vehiculo_id = null`.

\- \*\*Validaciones Realizadas:\*\*

&#x20;   - `npm.cmd run build` ejecutado correctamente.

&#x20;   - Se verifico que no se modificaran backend, SQL, dashboards, analytics ni reportes.



\---



\### 2025-10-28



\- \*\*Feature:\*\* Implementación de trazabilidad para gastos delegados en "Exploración Avanzada".

\- \*\*Archivos Afectados (Frontend):\*\*

&#x20;   - `src/components/admin/analytics/ExploracionAvanzadaTab.vue`

\- \*\*Backend Afectado:\*\*

&#x20;   - \*\*Vista:\*\* `admin\_gastos\_completos` (añadidas columnas `creado\_por\_id` y `creador\_gasto\_nombre`).

&#x20;   - \*\*RPC:\*\* `filtrar\_gastos\_admin` (versión `TABLE`) (añadido parámetro `p\_creado\_por\_id`).

\- \*\*Riesgos:\*\* Mínimos. La modificación de la vista fue aditiva y la RPC se actualizó para ser compatible.

\- \*\*Validaciones Realizadas:\*\*

&#x20;   - Se verificó que el nuevo filtro funciona correctamente.

&#x20;   - Se confirmó que la nueva columna se muestra en la UI.

&#x20;   - Se validó que la exportación a Excel incluye la nueva columna.

&#x20;   - Se confirmó que no hay regresiones en la pestaña "Reportes Operativos", que también consume una versión de esta RPC.



\---



\### 2025-10-28



\- \*\*Feature:\*\* Creación del módulo "Reportes Operativos" para administradores.

\- \*\*Archivos Afectados (Frontend):\*\*

&#x20;   - `src/composables/useAdminReports.js` (Nuevo)

&#x20;   - `src/components/admin/AdminReportGenerator.vue` (Nuevo)

&#x20;   - `src/components/admin/ReportEmailModal.vue` (Nuevo)

&#x20;   - `src/components/admin/ReportScheduleDrawer.vue` (Nuevo)

&#x20;   - `src/views/admin/AdminAnalyticsView.vue` (Integración)

&#x20;   - `src/composables/useReportGenerator.js` (Modificado)

\- \*\*Backend Afectado:\*\*

&#x20;   - \*\*RPC:\*\* `filtrar\_gastos\_admin` (versión `json`) (Creada/Modificada).

&#x20;   - \*\*Edge Function:\*\* `send-report` (Nueva, parcialmente implementada).

\- \*\*Riesgos:\*\* La generación de PDF en la Edge Function es un placeholder y debe ser completada.

\- \*\*Validaciones Realizadas:\*\*

&#x20;   - La pestaña se renderiza correctamente.

&#x20;   - Los KPIs y tablas se cargan con datos.

&#x20;   - La exportación a PDF y Excel funciona.

&#x20;   - Los modales de envío y programación se abren.

&#x20;   - La llamada a la Edge Function se realiza, aunque falle por lógica interna.



\---

