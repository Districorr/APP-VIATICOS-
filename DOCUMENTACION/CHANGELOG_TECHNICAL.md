# Changelog Técnico - InfoGastos Districorr

Este documento registra los cambios técnicos significativos realizados en el proyecto.

---

### 2026-05-13

- **Feature:** F-LOG-001 - Gastos a Cuenta Corriente de la Empresa.
- **Archivos Afectados (Frontend):**
    - `src/components/GastoForm.vue`
- **Documentacion Afectada:**
    - `DOCUMENTACION/FEATURE_SPECS/FEATURE_SPEC_F-LOG-001_CUENTA_CORRIENTE_EMPRESA.md`
    - `DOCUMENTACION/FRONTEND_ARCHITECTURE.md`
    - `DOCUMENTACION/FRONTEND_BACKEND_DATA_FLOW.md`
    - `DOCUMENTACION/CURRENT_IMPLEMENTATION_STATUS.md`
    - `DOCUMENTACION/PROJECT_CONTEXT_MASTER.md`
- **Backend Afectado:**
    - No aplica. No se crearon tablas, columnas, RPCs, triggers, views ni SQL.
- **Comportamiento:**
    - Se agrego la opcion `A Cuenta Corriente de la Empresa` en el Paso 1 de `GastoForm.vue`.
    - El flujo no solicita rendicion, caja diaria ni receptor de delegacion.
    - El payload se envia con `origen_gasto = 'cuenta_corriente_empresa'`, `estado_delegacion = 'directo'`, `viaje_id = null`, `caja_id = null` y `vehiculo_id = null`.
- **Validaciones Realizadas:**
    - `npm.cmd run build` ejecutado correctamente.
    - Se verifico que no se modificaran backend, SQL, dashboards, analytics ni reportes.

---

### 2025-10-28

- **Feature:** Implementación de trazabilidad para gastos delegados en "Exploración Avanzada".
- **Archivos Afectados (Frontend):**
    - `src/components/admin/analytics/ExploracionAvanzadaTab.vue`
- **Backend Afectado:**
    - **Vista:** `admin_gastos_completos` (añadidas columnas `creado_por_id` y `creador_gasto_nombre`).
    - **RPC:** `filtrar_gastos_admin` (versión `TABLE`) (añadido parámetro `p_creado_por_id`).
- **Riesgos:** Mínimos. La modificación de la vista fue aditiva y la RPC se actualizó para ser compatible.
- **Validaciones Realizadas:**
    - Se verifcó que el nuevo filtro funciona correctamente.
    - Se confirmó que la nueva columna se muestra en la UI.
    - Se validó que la exportación a Excel incluye la nueva columna.
    - Se confirmó que no hay regresiones en la pestaña "Reportes Operativos", que también consume una versión de esta RPC.

---

### 2025-10-28

- **Feature:** Creación del módulo "Reportes Operativos" para administradores.
- **Archivos Afectados (Frontend):**
    - `src/composables/useAdminReports.js` (Nuevo)
    - `src/components/admin/AdminReportGenerator.vue` (Nuevo)
    - `src/components/admin/ReportEmailModal.vue` (Nuevo)
    - `src/components/admin/ReportScheduleDrawer.vue` (Nuevo)
    - `src/views/admin/AdminAnalyticsView.vue` (Integración)
    - `src/composables/useReportGenerator.js` (Modificado)
- **Backend Afectado:**
    - **RPC:** `filtrar_gastos_admin` (versión `json`) (Creada/Modificada).
    - **Edge Function:** `send-report` (Nueva, parcialmente implementada).
- **Riesgos:** La generación de PDF en la Edge Function es un placeholder y debe ser completada.
- **Validaciones Realizadas:**
    - La pestaña se renderiza correctamente.
    - Los KPIs y tablas se cargan con datos.
    - La exportación a PDF y Excel funciona.
    - Los modales de envío y programación se abren.
    - La llamada a la Edge Function se realiza, aunque falle por lógica interna.

---

### 2026-06-01

- **Feature:** F-LOG-002 + F-LOG-003 + ajuste de reporte de Encomiendas/Costos.
- **Archivos Afectados (Frontend):**
   - `src/components/admin/analytics/EncomiendasCostosTab.vue`
   - `src/components/admin/AdminEditarGastoCuentaCorrienteModal.vue`
   - `src/composables/useEncomiendasPdfExporter.js`
   - `src/composables/useEncomiendasExcelExporter.js`
- **Backend Afectado:**
   - No aplica (sin cambios SQL estructurales en esta sesión).
- **RPCs usadas:**
   - `admin_actualizar_gasto_cuenta_corriente`
   - `admin_crear_proveedor_basico`
- **Comportamiento:**
   - Edición admin de gastos `cuenta_corriente_empresa` vía modal.
   - Alta de proveedor desde modal con autoselección del nuevo proveedor.
   - Reporte: bloque de imputación con monto total + cantidad de operaciones por modalidad.
- **Validaciones:**
   - `npm.cmd run build` ejecutado correctamente.

---

### 2026-07-28

- **Feature:** Reducción de escala de la UI global.
- **Archivos Afectados (Frontend):**
   - `src/assets/style.css`
- **Backend Afectado:**
   - No aplica.
- **Comportamiento:**
   - Reducción del 30% en el tamaño visual de los componentes (mediante `font-size: 70%` en la regla base `html`) para optimizar la densidad de información y reducir el desplazamiento vertical excesivo.
- **Validaciones:**
   - Compilación exitosa en desarrollo.

---

### 2026-07-28 (Siguiente Sesión)

- **Feature:** Reestructuración y optimización de UI/UX en el módulo de Logística / Encomiendas.
- **Archivos Afectados (Frontend):**
   - `src/composables/useEncomiendasDashboard.js`
   - `src/components/admin/analytics/EncomiendasCostosTab.vue`
   - `src/components/admin/AdminEditarGastoCuentaCorrienteModal.vue`
   - `src/components/admin/EncomiendasBulkPaymentsModal.vue`
   - `src/components/admin/AdminCtaCteVencimientosModal.vue` (Nuevo)
- **Backend Afectado:**
   - No aplica.
- **Comportamiento:**
   - **Autodetectado de Cirugía:** Detección de las palabras clave "CIRUGIA"/"CIRUGÍA" en gastos sin proveedor para imputarlos e incluirlos automáticamente bajo "LOGISTICA CIRUGIA" (ID 14). Reajuste dinámico de desgloses semanales y listados de proveedores en el frontend.
   - **Controles rápidos en modales:** Casilla "Es Logística de Cirugía" en los modales de edición administrativa y de carga masiva de pagos (cuenta corriente).
   - **Reporte de vencimientos Cta. Cte. (Libro Mayor):** Desarrollo de un modal de parametrización por mes de vencimiento y descarga de reportes PDF detallados usando `jsPDF` y `jsPDF-AutoTable`. Se corrigió el error HTTP 300 (Multiple Choices) al consultar Supabase añadiendo la unión explícita `!user_id` sobre la tabla `perfiles`.
   - **UI Compacta y Filtros Colapsables:** Consolidación de los KPIs y datos de cupo mensual en un panel de métricas horizontal unificado. Filtros colapsables con badge indicador de filtros activos.
   - **Tabla Semanal de Control Optimizada:** Reemplazo de las 5 columnas semanales horizontales por filas colapsables individuales (acordeón con chevron) por proveedor y totales. Los desgloses semanales se muestran dentro de una rejilla de tarjetas compactas de fondo gris claro para evitar desplazamientos horizontales en la pantalla.
   - **Drill-Down Interactivo por Semana:** Implementación de tarjetas semanales clicables que filtran instantáneamente los Pagos Asociados en el lado del cliente (sin latencia de red) por el rango de fechas de la semana y el proveedor seleccionado, acompañadas de un banner indicador y scroll automático suave.
- **Validaciones:**
   - Compilación de producción exitosa mediante `npm run build`.
