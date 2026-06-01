# CURRENT_IMPLEMENTATION_STATUS.md

## Estado Actual de Implementación — InfoGastos Districorr

**Versión:** 1.0  
**Fecha de consolidación:** 2026-05-12  
**Propósito:** clasificar el estado real del proyecto por módulos, identificar qué está implementado, qué es sensible, qué está parcial, qué permanece pendiente y qué requiere verificación adicional en código.

---

## 1. Cómo leer este documento

Este archivo busca responder una pregunta simple:

> **¿Qué partes del proyecto InfoGastos ya existen, cuáles están maduras, cuáles son delicadas y cuáles siguen en evolución?**

Se construye a partir de:

- documentación funcional y técnica previa del proyecto;
- documentación frontend consolidada;
- exports reales de Supabase;
- catálogo de RPCs, views y triggers;
- matriz RLS;
- changelog técnico aportado;
- hoja de ruta y preguntas abiertas.

### Estados utilizados

| Estado | Significado |
| --- | --- |
| **Implementado y estable** | Existe, su propósito está claro y no aparece como foco principal de deuda o inconsistencia. |
| **Implementado pero sensible** | Existe y es importante, pero está acoplado, tiene riesgos técnicos o requiere especial cuidado al modificarlo. |
| **Parcialmente implementado** | Hay base funcional o técnica, pero el módulo no está completamente cerrado o su alcance todavía está evolucionando. |
| **Pendiente / hoja de ruta** | Fue definido o propuesto, pero no puede asumirse como implementado. |
| **Documentado pero requiere verificación en código** | El flujo aparece en documentación o esquema, pero su estado exacto de UI/uso requiere revisión del repositorio. |

---

## 2. Resumen ejecutivo

### Estado global del proyecto

**InfoGastos Districorr** cuenta con una base funcional y técnica significativa. El núcleo del producto ya está bien definido:

- gestión de rendiciones;
- carga de gastos;
- caja chica;
- delegación de gastos;
- reportes PDF;
- administración y analytics;
- análisis geográfico de transportes;
- configuración de reportes;
- una base incipiente de flota.

El backend en Supabase es **amplio y real**, con:

- 26 tablas públicas;
- 54 foreign keys;
- 99 funciones/RPCs;
- 9 views;
- 5 triggers;
- 75 políticas RLS.

El proyecto ya no debe tratarse como un MVP embrionario, sino como una **aplicación interna en crecimiento con módulos críticos en producción o próximos a estabilización**.

---

## 3. Estado por macro-módulo

| Módulo | Estado | Prioridad de atención |
| --- | --- | --- |
| Autenticación, perfiles y routing protegido | Implementado y estable | Media |
| Rendiciones / viajes | Implementado pero sensible | Alta |
| Gastos | Implementado pero sensible | Alta |
| Delegación de gastos | Implementado pero sensible | Alta |
| Caja chica | Implementado pero sensible | Alta |
| Reportes de rendición | Implementado pero sensible | Alta |
| Reportes de caja | Implementado y estable / sensible según evolución | Media |
| Configuración personalizada de reportes | Parcialmente implementado | Alta |
| Administración de tipos de gasto | Implementado | Media |
| Permisos por tipo/formato | Implementado, revisar cobertura | Media |
| Exploración avanzada / analytics admin | Implementado pero sensible | Alta |
| Reportes operativos admin | Parcialmente implementado | Alta |
| Análisis geográfico de transportes | Implementado | Media |
| Gestión de catálogos | Implementado | Media |
| Notificaciones | Implementado en backend, UI a verificar | Media |
| Flota y combustible | Parcialmente implementado | Alta |
| Comparativas avanzadas / sobrecostos / geocodificación automática | Pendiente / hoja de ruta | Media |

---

## 4. Estado detallado por módulo

---

# 4.1. Autenticación, perfiles y control de acceso

### Estado
**Implementado y estable**

### Evidencia documental/técnica
- Arquitectura frontend con `main.js`, `App.vue`, `router/index.js`.
- Resolución de sesión mediante Supabase Auth.
- Uso de `perfiles` para rol y metadatos.
- RLS habilitado y forzado en `perfiles`.

### Funcionalidades consolidadas
- Login de usuarios.
- Montaje de la app luego de resolver auth.
- Guards de ruta.
- Protección de rutas autenticadas.
- Protección de rutas admin.

### Riesgos / puntos a vigilar
- Existen múltiples funciones auxiliares de rol (`get_my_role()`, `get_user_role()`) utilizadas en políticas y backend; mantener consistencia.
- `perfiles` es tabla central y tiene RLS forzado, por lo que cualquier cambio de seguridad debe revisarse cuidadosamente.

### Prioridad
**Media**

---

# 4.2. Rendiciones / viajes

### Estado
**Implementado pero sensible**

### Evidencia documental/técnica
- Tabla `viajes` confirmada en Supabase.
- Estados de aprobación definidos por constraint.
- Trigger vinculado al cierre de rendición.
- Flujo funcional documentado: creación → carga de gastos → cierre → revisión admin.
- RPC de aprobación/rechazo identificada.

### Funcionalidades consolidadas
- Crear rendición.
- Listar rendiciones.
- Asociar gastos.
- Cerrar y enviar.
- Aprobar/rechazar desde administración.
- Generar reportes.

### Sensibilidades técnicas
- `viajes.user_id` referencia a `auth.users`, no a `perfiles`.
- `gastos.viaje_id` usa `ON DELETE CASCADE`: borrar una rendición elimina sus gastos.
- La tabla `viajes` posee una gran cantidad de políticas RLS superpuestas o redundantes.
- La lógica de actualización cuando la rendición está abierta aparece repetida en varias políticas.

### Riesgos
- Regresiones al tocar cierres, permisos o borrados.
- Redundancia de políticas RLS.
- Dependencias con reportes y analytics.

### Prioridad
**Alta**

---

# 4.3. Gastos

### Estado
**Implementado pero sensible**

### Evidencia documental/técnica
- Tabla `gastos` completamente documentada.
- 39 columnas y múltiples relaciones.
- Constraints de:
  - estado de delegación;
  - estado de revisión;
  - unicidad factura + proveedor;
  - exclusividad de origen.
- View `admin_gastos_completos` y RPC `filtrar_gastos_admin(...)` consumen este núcleo.

### Funcionalidades consolidadas
- Alta y edición de gasto.
- Gasto asociado a rendición.
- Gasto asociado a caja chica.
- Gasto delegado.
- Gasto a cuenta corriente de la empresa mediante F-LOG-001, sin `viaje_id`, `caja_id` ni `vehiculo_id`.
- Gasto relacionado con catálogos, transporte y geografía.
- Estados de revisión.
- Exportación y análisis.

### Sensibilidades técnicas
- Es la tabla más acoplada del sistema.
- Tiene relaciones con:
  - `viajes`
  - `cajas_chicas`
  - `vehiculos`
  - `grupos_gastos`
  - `clientes`
  - `proveedores`
  - `transportes`
  - `tipos_gasto_config`
  - `formatos_gasto_config`
  - `localidades`
  - `provincias`
- La exclusividad de origen permite **cero o un origen**, no exige exactamente uno.
- `gastos.user_id` tiene doble FK: a `auth.users` y `perfiles`.
- RLS de `gastos` está muy poblado, con políticas repetidas o solapadas.

### Riesgos
- Alto riesgo de romper flujos laterales al modificar columnas o payloads.
- Impacto directo en reportes, analytics y delegaciones.
- Riesgo de inconsistencias si se agrega lógica solo en frontend.

### Prioridad
**Alta**

---

# 4.4. Delegación de gastos

### Estado
**Implementado pero sensible**

### Evidencia documental/técnica
- Estado `estado_delegacion` en `gastos`.
- Tabla `historial_delegaciones`.
- RPCs de aceptación y rechazo identificadas.
- Flujos documentados en negocio y frontend-backend.

### Funcionalidades consolidadas
- Crear gasto delegado.
- Mantener trazabilidad del creador.
- Registrar receptor.
- Aceptar o rechazar.
- Registrar decisiones.
- Notificar cambios.

### Sensibilidades técnicas
- El flujo redefine ownership funcional del gasto.
- Interactúa con:
  - `gastos.user_id`
  - `gastos.creado_por_id`
  - `estado_delegacion`
  - `historial_delegaciones`
  - notificaciones
- Existe una observación de seguridad: la política de INSERT de gastos con `pendiente_aceptacion` merece validación específica.

### Riesgos
- Que una modificación rompa la trazabilidad entre creador y responsable.
- Que se habiliten inserts más amplios de lo previsto.
- Que reportes o analytics interpreten mal el responsable vs creador.

### Prioridad
**Alta**

---

# 4.5. Caja chica

### Estado
**Implementado pero sensible**

### Evidencia documental/técnica
- Tablas:
  - `cajas_chicas`
  - `movimientos_caja`
  - `solicitudes_reposicion`
- Trigger de saldo bajo documentado.
- RPC `ajustar_saldo_caja_manual(...)` identificada.
- Vista `movimientos_caja_detalle` relevada en documentación backend previa.

### Funcionalidades consolidadas
- Caja por responsable.
- Registro de gasto asociado.
- Movimiento contable.
- Solicitud de reposición.
- Ajuste admin.
- Reporte de caja.

### Sensibilidades técnicas
- `movimientos_caja` actúa como libro operativo/contable de la caja.
- La escritura directa parece restringida; buena parte del flujo debe resolverse mediante backend controlado.
- Las tablas `solicitudes_reposicion` aparecen sin RLS habilitado en el export.
- El saldo actual y deuda del responsable son datos de alta sensibilidad operativa.

### Riesgos
- Inconsistencia entre gasto, movimiento y saldo.
- Uso incorrecto de updates manuales en vez de RPCs.
- Revisar exposición de tablas sin RLS si se consumen desde frontend.

### Prioridad
**Alta**

---

# 4.6. Reporte de rendición

### Estado
**Implementado pero sensible**

### Evidencia documental/técnica
- RPC `get_reporte_rendicion_completa(...)`.
- Composable `useReportGenerator.js`.
- Componente `ReporteRendicion.vue`.
- Vista de configuración de reportes.

### Funcionalidades consolidadas
- Obtener datos consolidados.
- Generar PDF de rendición.
- Renderizar vista previa.
- Integrar agrupaciones y resúmenes.

### Sensibilidades técnicas
- El generador PDF depende del shape exacto del JSON retornado por la RPC.
- Cambios en agrupaciones, campos visibles o configuración personalizada pueden romper el render.
- La documentación previa marcaba una tarea pendiente: aplicar completamente configuración seleccionada en `generateCanvaStylePDF`.

### Estado de esa mejora
**Parcialmente implementado / requiere verificación en código.**

### Prioridad
**Alta**

---

# 4.7. Reporte de caja

### Estado
**Implementado y funcional, con sensibilidad media**

### Evidencia documental/técnica
- RPC `get_reporte_caja_completo(...)`.
- Generación mediante `useReportGenerator.js`.
- Integración con `CajaDiariaView.vue`.

### Funcionalidades consolidadas
- Resumen de movimientos.
- Datos por categoría/provincia.
- PDF de caja.

### Riesgos
- Dependencia de movimientos y estados de caja.
- Crecimiento del generador de PDF.

### Prioridad
**Media**

---

# 4.8. Configuración personalizada de reportes

### Estado
**Parcialmente implementado**

### Evidencia documental/técnica
- Tabla `reporte_rendicion_config` confirmada.
- Índice único parcial default confirmado.
- RPC `save_reporte_rendicion_config(...)`.
- Vista `PerfilConfigReporteView.vue`.

### Funcionalidades implementadas
- Estructura de configuración.
- Persistencia de plantillas.
- Un default por usuario.
- UI para gestión de configuraciones.

### Pendiente o sensible
- La hoja de ruta original señalaba como pendiente aplicar completamente la configuración seleccionada en el generador PDF.
- La tabla `reporte_rendicion_config` aparece sin RLS habilitado en el export; revisar exposición/uso efectivo.

### Prioridad
**Alta**

---

# 4.9. Administración de tipos de gasto

### Estado
**Implementado**

### Evidencia documental/técnica
- Vista `AdminTiposGastoGlobalesView.vue`.
- Tabla `tipos_gasto_config`.
- Pivote `usuario_tipos_gasto_permitidos`.
- Políticas RLS para tipos de gasto.

### Funcionalidades consolidadas
- CRUD de categorías.
- Visualización de propiedades.
- Asignación de permisos por usuario.

### Riesgos
- Cambiar tipos de gasto impacta formularios, reportes y analytics.
- El pivote `usuario_tipos_gasto_permitidos` aparece sin RLS habilitado; revisar si su exposición es intencional o indirecta.

### Prioridad
**Media**

---

# 4.10. Formatos de gasto configurables

### Estado
**Implementado / sensible**

### Evidencia documental/técnica
- Tablas:
  - `formatos_gasto_config`
  - `campos_formato_config`
  - `usuario_formatos_permitidos`
- `perfiles.formato_predeterminado_id`.

### Funcionalidades consolidadas
- Formatos de carga.
- Campos dinámicos.
- Permisos por usuario.
- Formato predeterminado por perfil.

### Riesgos
- Impacto directo en `GastoForm.vue`.
- Dependencia entre configuración backend y render de frontend.
- Políticas RLS duplicadas en tablas de configuración.

### Prioridad
**Media-Alta**

---

# 4.11. Exploración avanzada y analytics admin

### Estado
**Implementado pero sensible**

### Evidencia documental/técnica
- `AdminAnalyticsView.vue`
- `ExploracionAvanzadaTab.vue`
- RPC `filtrar_gastos_admin(...)`
- View `admin_gastos_completos`
- Changelog confirma extensiones de trazabilidad y filtros.

### Funcionalidades consolidadas
- Filtros avanzados.
- Paginación.
- Conteo total.
- Exportación a Excel.
- Visualización administrativa consolidada.

### Sensibilidades técnicas
- `filtrar_gastos_admin` presenta overloads activos.
- `admin_gastos_completos` es vista crítica y altamente dependida.
- Cambios de alias, joins o columnas pueden romper frontend y exportaciones.

### Riesgos
- Ambigüedad de firma en RPC.
- Costos de rendimiento con crecimiento de `gastos`.
- Ruptura cruzada entre exploración y reportes operativos.

### Prioridad
**Alta**

---

# 4.12. Reportes operativos administrativos

### Estado
**Parcialmente implementado**

### Evidencia documental/técnica
- Changelog indica creación de:
  - `useAdminReports.js`
  - `AdminReportGenerator.vue`
  - `ReportEmailModal.vue`
  - `ReportScheduleDrawer.vue`
- Se documenta una Edge Function `send-report` con generación PDF placeholder.

### Funcionalidades disponibles
- Render de pestaña.
- KPIs/tablas.
- Exportación PDF/Excel.
- Modales de envío/programación.

### Pendiente
- Completar la generación de PDF real en Edge Function.
- Validar flujo real de reportes programados.
- Confirmar persistencia definitiva de configuraciones si aplica.

### Prioridad
**Alta**

---

# 4.13. Análisis geográfico de transportes

### Estado
**Implementado**

### Evidencia documental/técnica
- `AdminTransportesView.vue`.
- RPC `get_transporte_analisis_geografico(...)`.
- Uso de Leaflet.
- Relación con provincias y localidades.

### Funcionalidades consolidadas
- Filtros.
- KPIs.
- Agregados por provincia/localidad.
- Mapa interactivo.
- Gestión de transportes.

### Riesgos
- Dependencia de coordenadas en localidades.
- Nuevas localidades sin geocodificación pueden degradar el valor del mapa.
- Debe mantenerse coherencia entre datos de gasto y normalización geográfica.

### Prioridad
**Media**

---

# 4.14. Catálogos maestros

### Estado
**Implementado**

### Tablas principales
- `clientes`
- `proveedores`
- `transportes`
- `bancos`
- `provincias`
- `localidades`

### Funcionalidades conocidas
- Lectura y selección en formularios.
- Alta al vuelo en ciertos flujos.
- Administración de algunos catálogos.

### Sensibilidades
- `localidades` incluye unicidad por provincia.
- `proveedores` tiene restricciones de `nombre` y `cuit`.
- `clientes` tiene unicidad por `user_id + nombre_cliente`.

### Prioridad
**Media**

---

# 4.15. Notificaciones

### Estado
**Implementado en backend; UI concreta a verificar**

### Evidencia documental/técnica
- Tabla `notificaciones`.
- Políticas RLS.
- Referencias funcionales en:
  - cierre de rendición;
  - delegaciones;
  - caja chica.

### Funcionalidades confirmadas en backend
- Crear notificaciones.
- Leer propias.
- Marcar como leídas.
- Borrar propias.

### Requiere verificación
- Componente exacto de UI que las muestra.
- Cobertura completa de casos de negocio.

### Prioridad
**Media**

---

# 4.16. Flota y combustible

### Estado
**Parcialmente implementado**

### Evidencia técnica
- Tablas reales:
  - `vehiculos`
  - `vehiculo_asignaciones`
  - `registros_combustible`
- `gastos.vehiculo_id`.
- RPCs vinculadas a combustible y transportes/flota en el catálogo.

### Lo que existe
- Soporte de datos para vehículos.
- Asignaciones de usuario a vehículo.
- Registros de combustible.
- Integración potencial con gastos.

### Lo que no debe asumirse como completo
- Dashboard de flota.
- KPIs de costo por kilómetro.
- Alertas de mantenimiento.
- Gestión completa de mantenimientos.

### Prioridad
**Alta**, porque existe base real pero el producto aún parece evolucionar.

---

## 5. Funcionalidades pendientes o en hoja de ruta

| Feature | Estado |
| --- | --- |
| Comparativa entre períodos | Pendiente / hoja de ruta |
| Alertas de sobrecostos | Pendiente / hoja de ruta |
| Exportación de mapa/gráficos como imagen | Pendiente |
| Geocodificación automática de localidades | Pendiente |
| Gestión admin de localidades sin coordenadas | Pendiente |
| Aprobación/rechazo de gastos individuales | Propuesta / hoja de ruta |
| Dashboard específico de flota | Pendiente / parcial si hubo avances |
| Registro de mantenimientos de vehículos | Pendiente |
| Vista compacta/detallada en historiales | Pendiente |
| Mejoras de desagrupado/ordenamiento en gastos | Pendiente o requiere verificación |

---

## 6. Riesgos prioritarios del estado actual

### Riesgo 1 — Funciones RPC sobrecargadas
Existen nombres de funciones con múltiples firmas activas, especialmente `filtrar_gastos_admin(...)`. Esto puede generar ambigüedad, errores de invocación y mantenimiento más complejo.

**Prioridad:** Alta

---

### Riesgo 2 — Políticas RLS redundantes
`viajes` y `gastos` concentran múltiples políticas equivalentes o solapadas.

**Prioridad:** Alta

---

### Riesgo 3 — Tablas públicas sin RLS
Varias tablas operativas o de soporte aparecen sin RLS habilitado.

**Prioridad:** Alta para revisión de seguridad

---

### Riesgo 4 — Acoplamiento de reportes
PDFs y reportes dependen fuertemente de shapes de retorno de RPCs.

**Prioridad:** Alta

---

### Riesgo 5 — Complejidad central de `gastos`
Cualquier cambio en `gastos` puede impactar módulos cruzados.

**Prioridad:** Alta

---

### Riesgo 6 — Configuración de reportes parcialmente cerrada
La persistencia existe, pero la aplicación completa de la configuración en todos los outputs debe quedar verificada.

**Prioridad:** Media-Alta

---

### Riesgo 7 — Flota con backend más avanzado que la documentación funcional
La base existe, pero el nivel de madurez de UI/producto necesita revisarse.

**Prioridad:** Media-Alta

---

## 7. Estado de documentación consolidada

| Documento | Estado |
| --- | --- |
| `PROJECT_CONTEXT_MASTER.md` | Existe, pero conviene actualizarlo con la nueva profundidad técnica |
| `BUSINESS_DOMAIN_AND_FLOWS.md` | Existe y es útil |
| `FRONTEND_ARCHITECTURE.md` | Consolidado |
| `DATABASE_SCHEMA_AND_RELATIONSHIPS_FINAL.md` | Consolidado y basado en exports reales |
| `SUPABASE_RPCS_VIEWS_TRIGGERS_CATALOG.md` | Consolidado |
| `SUPABASE_RLS_SECURITY_MATRIX.md` | Consolidado |
| `FRONTEND_BACKEND_DATA_FLOW.md` | Consolidado |
| `TECHNICAL_RISKS_AND_REFACTOR_NOTES.md` | Existe, pero conviene actualizarlo |
| `SPEC_DRIVEN_DEVELOPMENT_GUIDE.md` | Existe |
| `AI_WORKING_CONTEXT.md` | Existe |
| `CHANGELOG_TECHNICAL.md` | Existe |
| `OPEN_QUESTIONS_AND_VERIFICATION_PENDING.md` | Existe, pero conviene actualizarlo con hallazgos reales |

---

## 8. Recomendación de próximos pasos

### Paso 1 — Actualizar documentos maestros generales
Actualizar:

1. `PROJECT_CONTEXT_MASTER.md`
2. `SUPABASE_BACKEND_ARCHITECTURE.md`
3. `TECHNICAL_RISKS_AND_REFACTOR_NOTES.md`
4. `OPEN_QUESTIONS_AND_VERIFICATION_PENDING.md`

para que reflejen:

- el esquema real;
- las RPCs reales;
- la matriz RLS real;
- los riesgos confirmados.

### Paso 2 — Revisar seguridad y deuda técnica
Priorizar:

- tablas sin RLS;
- políticas duplicadas;
- overloads de RPCs;
- alcance real de `pendiente_aceptacion` en gastos;
- exposición de tablas operativas.

### Paso 3 — Cerrar módulos parciales
Priorizar:

- configuración de reportes;
- reportes operativos;
- flota y combustible.

---

## 9. Conclusión

InfoGastos Districorr se encuentra en una etapa de **producto interno avanzado con arquitectura ya significativa**, no en una etapa exploratoria inicial.

El núcleo operativo está implementado, pero varios de sus módulos centrales requieren disciplina especial:

- `gastos`;
- `viajes`;
- delegaciones;
- caja chica;
- analytics;
- reportes.

La documentación técnica consolidada permite a partir de ahora trabajar con IA de forma mucho más segura, siempre que se mantenga el enfoque **Spec-Driven** y se actualicen los documentos maestros tras cada cambio relevante.
---

## 10. ActualizaciÃ³n breve de sesiÃ³n (2026-06-01)

- **F-LOG-002:** implementada ediciÃ³n administrativa de gastos `cuenta_corriente_empresa` en `src/components/admin/analytics/EncomiendasCostosTab.vue` con modal `src/components/admin/AdminEditarGastoCuentaCorrienteModal.vue`.
- **Persistencia F-LOG-002:** RPC `admin_actualizar_gasto_cuenta_corriente` (sin `update()` directo sobre `public.gastos`).
- **F-LOG-003:** implementada/avanzada creaciÃ³n de proveedor desde modal con RPC `admin_crear_proveedor_basico` (sin `insert` directo sobre `public.proveedores`) y selecciÃ³n automÃ¡tica del proveedor creado.
- **Reporte Encomiendas/Costos:** ajuste para mostrar por modalidad de imputaciÃ³n monto total + cantidad de operaciones (cuenta corriente empresa, rendiciones, caja chica).
- **Regla backend vigente:** no tocar `viaje_id`, `caja_id`, `vehiculo_id`, `origen_gasto`, `estado_delegacion` fuera de la lÃ³gica definida.
