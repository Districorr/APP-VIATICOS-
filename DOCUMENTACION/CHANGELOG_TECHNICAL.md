# Changelog Técnico - InfoGastos Districorr

Este documento registra los cambios técnicos significativos realizados en el proyecto.

---

### 2026-08-01

- **Feature:** Rediseño Completo del Módulo "Transportes y Movimientos" (Etapa 1 & Etapa 2).
- **Archivos Afectados (Frontend):**
    - `src/views/admin/AdminMovimientosTransporteView.vue` (Nuevo / Rediseñado)
    - `src/components/admin/logistica/MovimientoLogisticoForm.vue` (Nuevo / Dual Standalone & Embedded)
    - `src/composables/useLogisticaDescriptionParser.js` (Nuevo)
    - `src/components/admin/EncomiendasBulkPaymentsModal.vue` (Modificado)
    - `src/components/GastoForm.vue` (Modificado)
    - `src/components/admin/analytics/EncomiendasCostosTab.vue` (Modificado con Banner de Redirección)
    - `src/App.vue` (Panel DEBUG removido)
- **Documentación & Propuesta de Backend en Supabase (Offline):**
    - `SUPABASE_CHANGES/001_inspeccion_previa.sql`
    - `SUPABASE_CHANGES/002_cambio_propuesto.sql` (Actualización de RPC `crear_pagos_encomiendas_batch`)
    - `SUPABASE_CHANGES/003_verificacion_posterior.sql`
    - `SUPABASE_CHANGES/004_rollback.sql`
    - `SUPABASE_CHANGES/README.md`
- **Comportamiento & Mejoras Implementadas:**
    - Ventana operativa con 4 pestañas: Movimientos, Transportes, Control semanal y Cuenta corriente.
    - Paginación local configurable (10, 20, 50), filtros colapsables completos y respuestas textuales de volumen.
    - Acción de eliminación por fila (`TrashIcon`) con modal de confirmación.
    - Tarjetas de transporte clickeables con proyecciones mensuales dinámicas.
    - Acordeón semanal con rangos reales de fechas calendario y nombres de meses en español.
    - Exportaciones contextuales a Excel y PDF.
- **Validaciones Realizadas:**
    - `npm run build` verificado exitosamente (22.01s).

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

---

### 2026-07-31

- **Feature:** Carga al vuelo en formulario de pagos masivos de encomiendas.
- **Archivos Afectados (Frontend):**
   - `src/components/admin/EncomiendasBulkPaymentsModal.vue`
- **Backend Afectado:**
   - No aplica (utiliza las funciones RPC de Supabase existentes).
- **Comportamiento:**
   - **Taggable Inputs:** Habilitación de la propiedad `taggable` en los selectores `v-select` para Cliente, Transporte, Localidad destino y Proveedor.
   - **Creación en Tiempo Real:** Al escribir y presionar Enter sobre una opción inexistente, se dispara el helper `handleCreateEntity` que ejecuta las funciones de la base de datos `crear_entidad_al_vuelo` y `crear_localidad_al_vuelo` (vinculada con el `provincia_id` seleccionado en la fila actual).
   - **Sincronización Reactiva:** Las opciones locales reactivas correspondientes se actualizan en el acto para reflejar el ID real de base de datos retornado, permitiendo que otras filas seleccionen el nuevo valor inmediatamente.
- **Validaciones:**
   - Compilación de producción exitosa mediante `npm run build`.

---

### 2026-08-01

- **Feature:** Reestructuración de la máscara del input de monto en GastoForm.vue.
- **Archivos Afectados (Frontend):**
   - `src/components/GastoForm.vue`
- **Backend Afectado:**
   - No aplica.
- **Comportamiento:**
   - **Corrección de comportamiento decimal forzado (calculator-style):** Se reemplazó la lógica de entrada que dividía el número por 100 de forma predeterminada (lo que hacía que al ingresar números enteros como `150` quedaran detrás de la coma como `1,50`).
   - **Ingreso natural:** Ahora los números se digitan de manera normal como enteros (con separadores de miles insertados dinámicamente) y se puede ingresar la coma `,` o el punto `.` de forma explícita para digitar centavos/decimales.
   - **Estabilidad ante borrado y pegado:** El cursor conserva la posición correcta al borrar dígitos de forma intermedia y se soporta el pegado (paste) de montos tanto en formato con punto decimal como con coma.
- **Validaciones:**
   - Compilación de producción exitosa mediante `npm run build`.

---

### 2026-08-01 (Parte 2)

- **Feature:** Rediseño completo del Módulo de Transportes y Movimientos (Logística).
- **Archivos Afectados (Frontend):**
   - `src/views/admin/AdminMovimientosTransporteView.vue` [NUEVO]
   - `src/components/admin/logistica/MovimientoLogisticoForm.vue` [NUEVO]
   - `src/composables/useLogisticaDescriptionParser.js` [NUEVO]
   - `src/components/GastoForm.vue`
   - `src/views/admin/AdminDashboardView.vue`
   - `src/router/index.js`
- **Backend Afectado (Propuesta Técnica Explicita):**
   - Carpeta `SUPABASE_CHANGES/` generada con scripts `001_inspeccion_previa.sql`, `002_cambio_propuesto.sql`, `003_verificacion_posterior.sql`, `004_rollback.sql` y `README.md`.
- **Comportamiento:**
   - **Navegación Operativa (3 Pestañas):** Pestañas `Movimientos` (Para Franco - ¿Para qué se movió?), `Transportes` (Para Antonio - ¿Quién movió?) y `Cuenta corriente`. Acciones de carga rápida independientes.
   - **Respuestas Textuales Claras:** Reemplazo de gráficos abstractos por banners con explicaciones en lenguaje natural.
   - **Parser Inteligente No Invasivo:** Detección de patrones en descripciones (`PTE`, `CIRUGIA`, `DEVOLUCION`, Clientes, Proveedores) que sugiere valores en chips cliqueables sin sobrescribir campos automáticamente.
   - **Formulario Reusable:** `MovimientoLogisticoForm.vue` para carga de logística de cirugía vs. proveedor/otros.
- **Validaciones:**
   - Compilación de producción exitosa mediante `npm run build`.
