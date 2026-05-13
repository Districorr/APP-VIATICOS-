# SUPABASE_RPCS_VIEWS_TRIGGERS_CATALOG.md

## Catálogo técnico de RPCs, Vistas y Triggers — InfoGastos Districorr

**Versión:** 1.0  
**Fecha de consolidación:** 2026-05-12  
**Fuente:** exports reales del esquema de Supabase provistos en esta conversación.

---

## 1. Alcance

Este documento cataloga los objetos ejecutables y de lectura compuesta del backend Supabase:

- **99 funciones públicas** detectadas en `pg_proc`, incluyendo RPCs, funciones auxiliares y funciones de trigger.
- **9 vistas públicas** con definición exportada.
- **5 triggers de tabla** registrados en `information_schema.triggers`.

Este archivo complementa:

- `DATABASE_SCHEMA_AND_RELATIONSHIPS_FINAL.md`
- `SUPABASE_RLS_SECURITY_MATRIX.md` *(a generar como documento separado)*
- `FRONTEND_BACKEND_DATA_FLOW.md` *(a generar como documento separado)*

---

## 2. Resumen ejecutivo

| Objeto | Cantidad |
| --- | ---: |
| Funciones / RPCs públicas | 99 |
| Funciones `SECURITY DEFINER` | 50 |
| Funciones `SECURITY INVOKER` | 49 |
| Vistas públicas | 9 |
| Triggers de tabla | 5 |
| Nombres de función sobrecargados | 10 |

### Lectura técnica rápida

- El backend utiliza una combinación casi equilibrada entre **`SECURITY DEFINER` (50)** y **`SECURITY INVOKER` (49)**.
- Hay **10 nombres de función sobrecargados**, algunos en rutas críticas como:
  - `filtrar_gastos_admin`
  - `get_transporte_analisis_geografico`
  - `registrar_gasto_combustible_unificado`
  - `rechazar_gasto_delegado`
- Las vistas centrales de consulta administrativa son:
  - `admin_gastos_completos`
  - `admin_gastos_list_view`
  - `admin_viajes_list_view`
  - `vista_gastos_detallados`
- Los triggers cubren cuatro lógicas sistémicas:
  1. saldo bajo de caja,
  2. duplicados contextuales de gastos,
  3. restricciones de actualización de perfiles,
  4. notificación por cierre de viaje.

---

## 3. Vistas públicas

| Vista | Propósito funcional | Tablas / vistas referenciadas |
| --- | --- | --- |
| `admin_gastos_completos` | Vista administrativa amplia de gastos con joins a responsables, rendiciones, catálogos y origen operativo. | tipos_gasto_config, cajas_chicas, transportes, provincias, clientes, perfiles, gastos, viajes |
| `admin_gastos_list_view` | Vista de listado administrativo de gastos orientada a grilla/listado. | tipos_gasto_config, provincias, perfiles, gastos, viajes |
| `admin_solicitudes_view` | Vista consolidada de solicitudes de reposición con datos de caja y responsables. | solicitudes_reposicion, cajas_chicas, perfiles |
| `admin_viajes_con_responsable` | Vista de rendiciones unida con información del responsable. | perfiles, viajes |
| `admin_viajes_list_view` | Vista de listado administrativo de rendiciones con agregados o datos asociados. | perfiles, gastos, viajes |
| `historial_aprobaciones_rendicion_view` | Vista legible del historial de aprobaciones/rechazos de rendiciones. | historial_aprobaciones_rendicion, perfiles, viajes |
| `movimientos_caja_con_tipo` | Vista de movimientos de caja enriquecida con tipo de gasto. | tipos_gasto_config, movimientos_caja, gastos |
| `movimientos_caja_detalle` | Vista detallada de movimientos de caja con datos geográficos y del gasto. | tipos_gasto_config, movimientos_caja, localidades, provincias, gastos |
| `vista_gastos_detallados` | Vista integral de gastos enriquecida con múltiples catálogos, flota y geografía. | tipos_gasto_config, grupos_gastos, transportes, localidades, proveedores, provincias, vehiculos, clientes, perfiles, gastos |

### 3.1. Vistas críticas

#### `admin_gastos_completos`
Vista administrativa de alto impacto. Reúne información de:
- `gastos`
- `viajes`
- `perfiles`
- `tipos_gasto_config`
- `clientes`
- `transportes`
- `provincias`
- `cajas_chicas`

**Riesgo:** cambios en aliases o columnas expuestas pueden romper filtros administrativos, exportaciones o reportes.

#### `vista_gastos_detallados`
Vista de gastos enriquecida con mayor amplitud de catálogos, incluyendo:
- responsables,
- cliente,
- proveedor,
- transporte,
- grupo,
- localidades,
- vehículos,
- provincias.

**Riesgo:** es candidata a ser utilizada como fuente transversal para analítica y puede tener alto costo si se sobrecarga.

#### `movimientos_caja_detalle`
Vista destinada a reportes o historiales de caja chica con gasto asociado y dimensión geográfica.

**Riesgo:** su semántica depende de movimientos de caja con y sin `gasto_id`.

---

## 4. Triggers públicos

| Trigger | Tabla | Momento / evento | Función ejecutada | Propósito |
| --- | --- | --- | --- | --- |
| `trg_caja_saldo_bajo` | `cajas_chicas` | AFTER UPDATE | `EXECUTE FUNCTION notify_low_balance()` | Detectar saldo bajo en caja chica y disparar notificación. |
| `trg_check_gasto_duplicado_contextual` | `gastos` | BEFORE INSERT | `EXECUTE FUNCTION check_gasto_duplicado_contextual()` | Prevenir duplicados contextuales al insertar o actualizar gastos. |
| `trg_check_gasto_duplicado_contextual` | `gastos` | BEFORE UPDATE | `EXECUTE FUNCTION check_gasto_duplicado_contextual()` | Prevenir duplicados contextuales al insertar o actualizar gastos. |
| `trg_before_profile_update_restrictions` | `perfiles` | BEFORE UPDATE | `EXECUTE FUNCTION trigger_check_profile_update_restrictions()` | Restringir actualizaciones sensibles de perfiles. |
| `on_viaje_closed` | `viajes` | AFTER UPDATE | `EXECUTE FUNCTION trg_crear_notificacion_cierre_viaje()` | Generar notificación cuando una rendición se cierra. |

### 4.1. Implicancias

#### `trg_caja_saldo_bajo`
- Se ejecuta `AFTER UPDATE` sobre `cajas_chicas`.
- Invoca `notify_low_balance()`.
- Debe considerarse al modificar reglas de reposición, deuda responsable o saldo actual.

#### `trg_check_gasto_duplicado_contextual`
- Se ejecuta `BEFORE INSERT` y `BEFORE UPDATE` sobre `gastos`.
- Invoca `check_gasto_duplicado_contextual()`.
- Interviene en la prevención de duplicados; cualquier cambio en campos de facturación/proveedor debe revisarse contra esta función.

#### `trg_before_profile_update_restrictions`
- Se ejecuta `BEFORE UPDATE` sobre `perfiles`.
- Invoca `trigger_check_profile_update_restrictions()`.
- Sugiere protección de cambios sensibles de perfil.

#### `on_viaje_closed`
- Se ejecuta `AFTER UPDATE` sobre `viajes`.
- Invoca `trg_crear_notificacion_cierre_viaje()`.
- Se relaciona con el cierre/envío de rendiciones y la notificación a administradores.

---

## 5. Funciones sobrecargadas — punto sensible

La base contiene nombres de función con múltiples firmas. Esto requiere atención porque Supabase/PostgREST puede presentar ambigüedad si el frontend llama a una RPC con parámetros que coinciden parcialmente con más de una firma.

| Función | Cantidad de firmas | Firmas / retornos |
| --- | ---: | --- |
| `filtrar_gastos_admin` | 3 | `p_cliente_id bigint, p_transporte_id bigint, p_tipo_gasto_id bigint, p_provincia_id bigint, p_paciente text, p_fecha_desde date, p_fecha_hasta date` → `SETOF admin_gastos_completos`<br>`p_cliente_id bigint, p_transporte_id bigint, p_tipo_gasto_id bigint, p_provincia_id bigint, p_responsable_id uuid, p_creado_por_id uuid, p_paciente text, p_fecha_desde date, p_fecha_hasta date, p_origen text, p_limit integer, p_offset integer` → `TABLE(gastos json, total_count integer)`<br>`p_fecha_desde date, p_fecha_hasta date, p_user_id uuid, p_tipo_gasto_id bigint, p_cliente_id bigint, p_transporte_id bigint, p_provincia_id bigint, p_limit integer, p_offset integer` → `json` |
| `get_admin_analytics_dashboard` | 2 | `` → `jsonb`<br>`p_start_date date, p_end_date date` → `jsonb` |
| `get_detalle_rendicion_con_gastos` | 2 | `p_viaje_id bigint` → `json`<br>`p_viaje_id bigint, p_page integer, p_page_size integer` → `json` |
| `get_gastos_generales_audit` | 2 | `p_start_date date, p_end_date date, p_user_id uuid, p_tipo_gasto_id bigint` → `TABLE(id bigint, fecha_gasto date, monto_total numeric, descripcion text, numero_factura text, responsable_nombre text, tipo_gasto text, proveedor_nombre text, origen text)`<br>`p_start_date date, p_end_date date, p_user_id uuid, p_tipo_gasto_id bigint, p_vehiculo_id bigint` → `TABLE(id text, fecha_gasto date, monto_total numeric, descripcion text, numero_factura text, responsable_nombre text, tipo_gasto text, proveedor_nombre text, origen_vehiculo text)` |
| `get_transporte_analisis_geografico` | 2 | `p_transporte_id bigint, p_fecha_inicio date, p_fecha_fin date` → `json`<br>`p_transporte_ids bigint[], p_provincia_id bigint, p_localidad_ids bigint[], p_fecha_inicio_a date, p_fecha_fin_a date, p_fecha_inicio_b date, p_fecha_fin_b date` → `json` |
| `get_user_gastos_por_tipo_reporte` | 2 | `` → `TABLE(tipo_gasto_nombre text, total_monto numeric)`<br>`p_fecha_desde date, p_fecha_hasta date` → `TABLE(tipo_gasto_nombre text, total_monto numeric)` |
| `get_user_report_kpis` | 2 | `` → `jsonb`<br>`p_fecha_desde date, p_fecha_hasta date` → `jsonb` |
| `rechazar_gasto_delegado` | 2 | `p_gasto_id bigint` → `void`<br>`p_gasto_id bigint, p_motivo_rechazo text` → `void` |
| `registrar_carga_combustible` | 2 | `p_vehiculo_id bigint, p_fecha_carga date, p_litros numeric, p_monto_total numeric, p_odometro_actual integer, p_proveedor_id bigint, p_conductor_id uuid` → `jsonb`<br>`p_vehiculo_id bigint, p_fecha_carga date, p_litros numeric, p_monto_total numeric, p_odometro_actual integer, p_proveedor_id bigint, p_conductor_id uuid, p_numero_comprobante text, p_descripcion text` → `jsonb` |
| `registrar_gasto_combustible_unificado` | 2 | `p_vehiculo_id bigint, p_fecha_carga date, p_litros numeric, p_monto_total numeric, p_odometro_actual integer, p_proveedor_id bigint, p_numero_comprobante text, p_descripcion text, p_viaje_id bigint, p_caja_id bigint, p_user_id uuid` → `jsonb`<br>`p_vehiculo_id bigint, p_fecha_carga date, p_litros numeric, p_monto_total numeric, p_odometro_actual integer, p_proveedor_id bigint, p_numero_comprobante text, p_descripcion text, p_viaje_id bigint, p_caja_id bigint, p_user_id uuid, p_conductor_id uuid` → `jsonb` |

### Riesgo operativo principal

La función con mayor sensibilidad es:

#### `filtrar_gastos_admin`
Existen **3 firmas activas**:
1. una que retorna `SETOF admin_gastos_completos`;
2. una que retorna `TABLE(gastos json, total_count integer)`;
3. una que retorna `json`.

Esto confirma que el riesgo detectado en documentación previa era real: **la convivencia de overloads puede provocar errores de ambigüedad, contratos de retorno inconsistentes y consumo desigual entre componentes**.

---

## 6. RPCs y funciones críticas

| Función | Propósito | Firma(s), retorno y modo | Referencias detectadas |
| --- | --- | --- | --- |
| `aceptar_gasto_delegado` | Aceptar un gasto delegado y completar su tránsito funcional. | `p_caja_id bigint, p_gasto_id bigint, p_viaje_id bigint` → `void` [SECURITY DEFINER] | gastos, historial_delegaciones |
| `rechazar_gasto_delegado` | Rechazar un gasto delegado; existen dos firmas sobrecargadas. | `p_gasto_id bigint` → `void` [SECURITY DEFINER]<br>`p_gasto_id bigint, p_motivo_rechazo text` → `void` [SECURITY DEFINER] | gastos, historial_delegaciones |
| `crear_gasto_delegado` | Crear un gasto en flujo de delegación a partir de payload JSON. | `payload jsonb` → `jsonb` [SECURITY DEFINER] | gastos, historial_delegaciones |
| `ajustar_saldo_caja_manual` | Aplicar ajustes manuales a una caja chica y devolver resultado JSON. | `p_caja_id bigint, p_monto_ajuste numeric, p_descripcion text, p_realizado_por_id uuid` → `json` [SECURITY DEFINER] | cajas_chicas, movimientos_caja, perfiles |
| `aprobar_rechazar_rendicion` | Resolver administrativamente una rendición y registrar su decisión. | `p_viaje_id bigint, p_nuevo_estado text, p_comentarios text, p_admin_id uuid` → `text` [SECURITY DEFINER] | historial_aprobaciones_rendicion, notificaciones, perfiles, viajes |
| `filtrar_gastos_admin` | Motor de filtrado administrativo de gastos; existen tres firmas sobrecargadas. | `p_cliente_id bigint, p_transporte_id bigint, p_tipo_gasto_id bigint, p_provincia_id bigint, p_paciente text, p_fecha_desde date, p_fecha_hasta date` → `SETOF admin_gastos_completos` [SECURITY INVOKER]<br>`p_cliente_id bigint, p_transporte_id bigint, p_tipo_gasto_id bigint, p_provincia_id bigint, p_responsable_id uuid, p_creado_por_id uuid, p_paciente text, p_fecha_desde date, p_fecha_hasta date, p_origen text, p_limit integer, p_offset integer` → `TABLE(gastos json, total_count integer)` [SECURITY INVOKER]<br>`p_fecha_desde date, p_fecha_hasta date, p_user_id uuid, p_tipo_gasto_id bigint, p_cliente_id bigint, p_transporte_id bigint, p_provincia_id bigint, p_limit integer, p_offset integer` → `json` [SECURITY INVOKER] | admin_gastos_completos, gastos |
| `get_reporte_rendicion_completa` | Preparar datos JSON para el reporte completo de rendición. | `p_viaje_id bigint` → `json` [SECURITY INVOKER] | gastos, grupos_gastos, localidades, perfiles, proveedores, provincias, tipos_gasto_config, transportes, viajes |
| `get_reporte_caja_completo` | Preparar datos JSON para el reporte completo de caja chica. | `p_caja_id bigint, p_fecha_desde date, p_fecha_hasta date` → `json` [SECURITY INVOKER] | cajas_chicas, gastos, localidades, movimientos_caja, perfiles, provincias, tipos_gasto_config |
| `save_reporte_rendicion_config` | Persistir configuraciones de reportes de rendición. | `p_user_id uuid, p_nombre_configuracion text, p_campos_visibles jsonb, p_config_id bigint, p_agrupar_por text, p_incluir_resumen_por_categoria boolean, p_incluir_resumen_por_localidad boolean, p_incluir_resumen_por_provincia boolean, p_incluir_resumen_temporal boolean, p_es_default boolean` → `SETOF reporte_rendicion_config` [SECURITY DEFINER] | perfiles, reporte_rendicion_config |
| `registrar_gasto_caja_chica` | Registrar el impacto de un gasto en caja chica y calcular saldos. | `p_gasto_id bigint, p_caja_id bigint` → `TABLE(success boolean, message text, new_saldo numeric, new_deuda_responsable numeric, replenishment_needed boolean)` [SECURITY DEFINER] | cajas_chicas, gastos, movimientos_caja, perfiles |
| `registrar_carga_combustible` | Registrar cargas de combustible; existen dos firmas. | `p_vehiculo_id bigint, p_fecha_carga date, p_litros numeric, p_monto_total numeric, p_odometro_actual integer, p_proveedor_id bigint, p_conductor_id uuid` → `jsonb` [SECURITY DEFINER]<br>`p_vehiculo_id bigint, p_fecha_carga date, p_litros numeric, p_monto_total numeric, p_odometro_actual integer, p_proveedor_id bigint, p_conductor_id uuid, p_numero_comprobante text, p_descripcion text` → `jsonb` [SECURITY DEFINER] | registros_combustible, vehiculos |
| `registrar_gasto_combustible_unificado` | Registrar combustible y gasto unificado; existen dos firmas. | `p_vehiculo_id bigint, p_fecha_carga date, p_litros numeric, p_monto_total numeric, p_odometro_actual integer, p_proveedor_id bigint, p_numero_comprobante text, p_descripcion text, p_viaje_id bigint, p_caja_id bigint, p_user_id uuid` → `jsonb` [SECURITY DEFINER]<br>`p_vehiculo_id bigint, p_fecha_carga date, p_litros numeric, p_monto_total numeric, p_odometro_actual integer, p_proveedor_id bigint, p_numero_comprobante text, p_descripcion text, p_viaje_id bigint, p_caja_id bigint, p_user_id uuid, p_conductor_id uuid` → `jsonb` [SECURITY DEFINER] | gastos, registros_combustible, vehiculos |
| `get_transporte_analisis_geografico` | Analítica geográfica de transportes; existen dos firmas. | `p_transporte_id bigint, p_fecha_inicio date, p_fecha_fin date` → `json` [SECURITY INVOKER]<br>`p_transporte_ids bigint[], p_provincia_id bigint, p_localidad_ids bigint[], p_fecha_inicio_a date, p_fecha_fin_a date, p_fecha_inicio_b date, p_fecha_fin_b date` → `json` [SECURITY INVOKER] | gastos, localidades, provincias, transportes |
| `get_admin_analytics_dashboard` | Dashboard analítico administrativo; existen dos firmas. | `` → `jsonb` [SECURITY DEFINER]<br>`p_start_date date, p_end_date date` → `jsonb` [SECURITY DEFINER] | gastos, perfiles, tipos_gasto_config, viajes |
| `get_tipos_gasto_permitidos` | Obtener tipos de gasto habilitados para el usuario actual. | `` → `TABLE(id bigint, nombre_tipo_gasto text, icono_svg text, color_accent text, es_tipo_transporte boolean)` [SECURITY INVOKER] | perfiles, tipos_gasto_config, usuario_tipos_gasto_permitidos |
| `solicitar_eliminacion_gasto` | Crear solicitud de eliminación de un gasto. | `p_gasto_id bigint, p_motivo text` → `void` [SECURITY INVOKER] | gastos, solicitudes_eliminacion |

---

## 7. Catálogo completo de funciones públicas

| Función | Dominio | Argumentos | Retorno | Seguridad | Tablas / vistas mencionadas en la definición |
| --- | --- | --- | --- | --- | --- |
| `add_gastos_to_grupo` | Agrupación | `p_gasto_ids bigint[], p_grupo_id bigint` | `void` | SECURITY DEFINER | grupos_gastos, gastos, viajes |
| `delete_grupo_gasto` | Agrupación | `p_grupo_id bigint` | `void` | SECURITY DEFINER | grupos_gastos, gastos, viajes |
| `rename_grupo_gasto` | Agrupación | `p_grupo_id bigint, p_nuevo_nombre text` | `void` | SECURITY DEFINER | grupos_gastos, viajes |
| `filtrar_gastos_admin` | Analytics / Admin | `p_cliente_id bigint, p_transporte_id bigint, p_tipo_gasto_id bigint, p_provincia_id bigint, p_paciente text, p_fecha_desde date, p_fecha_hasta date` | `SETOF admin_gastos_completos` | SECURITY INVOKER | admin_gastos_completos |
| `filtrar_gastos_admin` | Analytics / Admin | `p_cliente_id bigint, p_transporte_id bigint, p_tipo_gasto_id bigint, p_provincia_id bigint, p_responsable_id uuid, p_creado_por_id uuid, p_paciente text, p_fecha_desde date, p_fecha_hasta date, p_origen text, p_limit integer, p_offset integer` | `TABLE(gastos json, total_count integer)` | SECURITY INVOKER | admin_gastos_completos, gastos |
| `filtrar_gastos_admin` | Analytics / Admin | `p_fecha_desde date, p_fecha_hasta date, p_user_id uuid, p_tipo_gasto_id bigint, p_cliente_id bigint, p_transporte_id bigint, p_provincia_id bigint, p_limit integer, p_offset integer` | `json` | SECURITY INVOKER | admin_gastos_completos, gastos |
| `get_admin_analytics_dashboard` | Analytics / Admin | `` | `jsonb` | SECURITY DEFINER | tipos_gasto_config, perfiles, gastos, viajes |
| `get_admin_analytics_dashboard` | Analytics / Admin | `p_start_date date, p_end_date date` | `jsonb` | SECURITY DEFINER | tipos_gasto_config, perfiles, gastos, viajes |
| `get_admin_strategic_overview` | Analytics / Admin | `p_start_date date, p_end_date date, p_tipo_gasto_ids integer[]` | `jsonb` | SECURITY INVOKER | tipos_gasto_config, cajas_chicas, gastos, viajes |
| `get_count_cajas_activas` | Analytics / Admin | `` | `integer` | SECURITY DEFINER | cajas_chicas |
| `get_count_rendiciones_pendientes` | Analytics / Admin | `` | `integer` | SECURITY INVOKER | viajes |
| `get_count_responsables_activos` | Analytics / Admin | `dias_atras integer` | `integer` | SECURITY INVOKER | gastos |
| `get_count_solicitudes_pendientes` | Analytics / Admin | `` | `integer` | SECURITY INVOKER | solicitudes_reposicion |
| `get_desglose_adelantos_por_responsable` | Analytics / Admin | `` | `TABLE(user_id uuid, nombre_responsable text, total_adelantado numeric, cantidad_rendiciones bigint)` | SECURITY INVOKER | perfiles, viajes |
| `get_evolucion_gastos` | Analytics / Admin | `p_fecha_inicio date, p_fecha_fin date, p_agrupador text` | `TABLE(periodo_label text, total_gastado numeric)` | SECURITY INVOKER | gastos |
| `get_evolucion_gastos_ars` | Analytics / Admin | `p_fecha_inicio date, p_fecha_fin date, p_agrupador text` | `SETOF gasto_evolucion_punto` | SECURITY INVOKER | gastos |
| `get_evolucion_gastos_ars_periodo_anterior` | Analytics / Admin | `p_fecha_inicio date, p_fecha_fin date, p_agrupador text` | `TABLE(periodo_label text, total_gastado_bruto numeric)` | SECURITY DEFINER |  |
| `get_evolucion_gastos_mensual` | Analytics / Admin | `` | `TABLE(mes text, total_gastado numeric)` | SECURITY INVOKER | gastos |
| `get_evolucion_por_cliente` | Analytics / Admin | `` | `TABLE(mes date, categoria text, total numeric)` | SECURITY INVOKER | clientes, gastos |
| `get_evolucion_por_tipo` | Analytics / Admin | `` | `TABLE(mes date, categoria text, total numeric)` | SECURITY INVOKER | tipos_gasto_config, gastos |
| `get_gastos_dashboard_insights` | Analytics / Admin | `p_start_date date, p_end_date date` | `jsonb` | SECURITY INVOKER | tipos_gasto_config, provincias, clientes, perfiles, gastos |
| `get_gastos_generales_audit` | Analytics / Admin | `p_start_date date, p_end_date date, p_user_id uuid, p_tipo_gasto_id bigint` | `TABLE(id bigint, fecha_gasto date, monto_total numeric, descripcion text, numero_factura text, responsable_nombre text, tipo_gasto text, proveedor_nombre text, origen text)` | SECURITY INVOKER | tipos_gasto_config, cajas_chicas, proveedores, vehiculos, perfiles, gastos, viajes |
| `get_gastos_generales_audit` | Analytics / Admin | `p_start_date date, p_end_date date, p_user_id uuid, p_tipo_gasto_id bigint, p_vehiculo_id bigint` | `TABLE(id text, fecha_gasto date, monto_total numeric, descripcion text, numero_factura text, responsable_nombre text, tipo_gasto text, proveedor_nombre text, origen_vehiculo text)` | SECURITY INVOKER | registros_combustible, tipos_gasto_config, proveedores, vehiculos, perfiles, gastos |
| `get_gastos_por_cliente` | Analytics / Admin | `p_fecha_inicio date, p_fecha_fin date` | `TABLE(cliente_nombre text, total_gastado numeric)` | SECURITY DEFINER | clientes, gastos |
| `get_gastos_por_responsable` | Analytics / Admin | `p_fecha_inicio date, p_fecha_fin date` | `TABLE(responsable_nombre text, total_gastado numeric)` | SECURITY DEFINER | perfiles, gastos |
| `get_gastos_por_tipo_en_periodo` | Analytics / Admin | `fecha_inicio date, fecha_fin date` | `TABLE(nombre_tipo text, total_gastado_bruto numeric, moneda_gastado text)` | SECURITY INVOKER | tipos_gasto_config, gastos |
| `get_gastos_por_transporte` | Analytics / Admin | `p_start_date date, p_end_date date` | `TABLE(categoria text, total numeric)` | SECURITY INVOKER | transportes, gastos |
| `get_gastos_protegidos` | Analytics / Admin | `` | `SETOF admin_gastos_completos` | SECURITY INVOKER | admin_gastos_completos, perfiles |
| `get_kpi_promedio_mensual` | Analytics / Admin | `` | `numeric` | SECURITY INVOKER | gastos |
| `get_prevision_gasto_siguiente_mes` | Analytics / Admin | `` | `numeric` | SECURITY INVOKER | gastos |
| `get_responsable_rendicion_insights` | Analytics / Admin | `p_user_id uuid, p_start_date date, p_end_date date` | `jsonb` | SECURITY INVOKER | tipos_gasto_config, perfiles, gastos, viajes |
| `get_top_clientes_por_gasto` | Analytics / Admin | `limite integer` | `TABLE(nombre_cliente text, total_gastado numeric)` | SECURITY INVOKER | clientes, gastos |
| `get_top_gastadores` | Analytics / Admin | `limite integer` | `TABLE(nombre_responsable text, puesto text, total_gastado numeric)` | SECURITY INVOKER | perfiles, gastos |
| `get_top_tipos_gasto` | Analytics / Admin | `` | `TABLE(tipo_gasto text, total_gastado numeric)` | SECURITY INVOKER | tipos_gasto_config, gastos |
| `get_top_transportes_por_gasto` | Analytics / Admin | `limite integer` | `TABLE(nombre_transporte text, total_gastado numeric)` | SECURITY INVOKER | transportes, gastos |
| `get_total_adelantos_activos` | Analytics / Admin | `` | `numeric` | SECURITY INVOKER | viajes |
| `get_total_gastado_global` | Analytics / Admin | `` | `numeric` | SECURITY INVOKER | gastos |
| `ajustar_saldo_caja_manual` | Caja chica | `p_caja_id bigint, p_monto_ajuste numeric, p_descripcion text, p_realizado_por_id uuid` | `json` | SECURITY DEFINER | movimientos_caja, cajas_chicas, perfiles |
| `get_movimientos_caja_detallados` | Caja chica | `p_caja_id bigint, p_start_date date, p_end_date date, p_tipo_movimiento text, p_search_term text` | `TABLE(id bigint, created_at timestamp with time zone, tipo_movimiento text, descripcion text, monto numeric, realizado_por_nombre text, es_delegado boolean, responsable_original_nombre text)` | SECURITY INVOKER | vista_gastos_detallados, movimientos_caja, perfiles |
| `registrar_gasto_caja_chica` | Caja chica | `p_gasto_id bigint, p_caja_id bigint` | `TABLE(success boolean, message text, new_saldo numeric, new_deuda_responsable numeric, replenishment_needed boolean)` | SECURITY DEFINER | movimientos_caja, cajas_chicas, perfiles, gastos |
| `usuario_editar_gasto_caja` | Caja chica | `p_gasto_id bigint, p_nueva_descripcion text` | `void` | SECURITY INVOKER | perfiles, gastos |
| `crear_banco_al_vuelo` | Catálogos / Alta al vuelo | `p_nombre_banco text` | `bigint` | SECURITY DEFINER | perfiles, bancos |
| `crear_entidad_al_vuelo` | Catálogos / Alta al vuelo | `p_nombre_entidad text, p_nombre_tabla text` | `bigint` | SECURITY DEFINER | transportes, proveedores, clientes |
| `aceptar_gasto_delegado` | Delegaciones | `p_caja_id bigint, p_gasto_id bigint, p_viaje_id bigint` | `void` | SECURITY DEFINER | historial_delegaciones, gastos |
| `crear_gasto_delegado` | Delegaciones | `payload jsonb` | `jsonb` | SECURITY DEFINER | historial_delegaciones, gastos |
| `crear_notificacion_delegacion` | Delegaciones | `p_receptor_id uuid, p_mensaje text, p_link text` | `void` | SECURITY DEFINER | notificaciones |
| `get_mi_historial_delegaciones_enviadas` | Delegaciones | `` | `TABLE(id bigint, decision text, motivo_rechazo text, fecha_decision timestamp with time zone, monto_gasto numeric, descripcion_gasto text, nombre_receptor text)` | SECURITY DEFINER | historial_delegaciones, perfiles, gastos |
| `get_mis_delegaciones_enviadas_pendientes` | Delegaciones | `` | `TABLE(id bigint, monto_total numeric, descripcion_general text, fecha_gasto date, created_at timestamp with time zone, receptor_nombre text, receptor_email text)` | SECURITY DEFINER | perfiles, gastos |
| `obtener_gastos_para_bandeja_delegados` | Delegaciones | `p_user_id uuid` | `SETOF gastos` | SECURITY DEFINER | gastos |
| `obtener_gastos_recibidos` | Delegaciones | `p_user_id uuid` | `SETOF gastos` | SECURITY DEFINER | gastos |
| `obtener_mi_historial_delegaciones` | Delegaciones | `` | `TABLE(id bigint, gasto_id bigint, decision text, motivo_rechazo text, fecha_decision timestamp with time zone, monto_gasto numeric, descripcion_gasto text, nombre_delegador text)` | SECURITY DEFINER | historial_delegaciones, perfiles, gastos |
| `rechazar_gasto_delegado` | Delegaciones | `p_gasto_id bigint` | `void` | SECURITY DEFINER | gastos |
| `rechazar_gasto_delegado` | Delegaciones | `p_gasto_id bigint, p_motivo_rechazo text` | `void` | SECURITY DEFINER | historial_delegaciones, gastos |
| `actualizar_asignaciones_vehiculo` | Flota / Combustible | `p_vehiculo_id bigint, p_usuarios_asignados_ids uuid[]` | `void` | SECURITY DEFINER | vehiculo_asignaciones |
| `get_analisis_flota_global` | Flota / Combustible | `p_start_date date, p_end_date date` | `jsonb` | SECURITY INVOKER | registros_combustible, tipos_gasto_config, vehiculos, gastos |
| `get_vehiculo_analisis` | Flota / Combustible | `p_vehiculo_id bigint, p_start_date date, p_end_date date` | `jsonb` | SECURITY INVOKER | registros_combustible, proveedores, vehiculos, perfiles |
| `get_vehiculos_asignados_al_usuario` | Flota / Combustible | `` | `TABLE(id bigint, patente text, marca text, modelo text)` | SECURITY INVOKER | vehiculo_asignaciones, vehiculos |
| `registrar_carga_combustible` | Flota / Combustible | `p_vehiculo_id bigint, p_fecha_carga date, p_litros numeric, p_monto_total numeric, p_odometro_actual integer, p_proveedor_id bigint, p_conductor_id uuid` | `jsonb` | SECURITY DEFINER | registros_combustible, vehiculos |
| `registrar_carga_combustible` | Flota / Combustible | `p_vehiculo_id bigint, p_fecha_carga date, p_litros numeric, p_monto_total numeric, p_odometro_actual integer, p_proveedor_id bigint, p_conductor_id uuid, p_numero_comprobante text, p_descripcion text` | `jsonb` | SECURITY DEFINER | registros_combustible, vehiculos |
| `registrar_gasto_combustible_unificado` | Flota / Combustible | `p_vehiculo_id bigint, p_fecha_carga date, p_litros numeric, p_monto_total numeric, p_odometro_actual integer, p_proveedor_id bigint, p_numero_comprobante text, p_descripcion text, p_viaje_id bigint, p_caja_id bigint, p_user_id uuid` | `jsonb` | SECURITY DEFINER | registros_combustible, vehiculos, gastos |
| `registrar_gasto_combustible_unificado` | Flota / Combustible | `p_vehiculo_id bigint, p_fecha_carga date, p_litros numeric, p_monto_total numeric, p_odometro_actual integer, p_proveedor_id bigint, p_numero_comprobante text, p_descripcion text, p_viaje_id bigint, p_caja_id bigint, p_user_id uuid, p_conductor_id uuid` | `jsonb` | SECURITY DEFINER | registros_combustible, vehiculos, gastos |
| `crear_localidad_al_vuelo` | Geografía / Transporte | `p_nombre_localidad text, p_provincia_id bigint` | `bigint` | SECURITY DEFINER | localidades |
| `get_analisis_localidades_por_transporte` | Geografía / Transporte | `p_transporte_id bigint, p_fecha_inicio date, p_fecha_fin date` | `json` | SECURITY INVOKER | localidades, provincias, gastos |
| `get_analisis_por_transporte` | Geografía / Transporte | `p_transporte_id bigint, p_fecha_inicio date, p_fecha_fin date` | `json` | SECURITY INVOKER | provincias, gastos |
| `get_provincias_unicas_gastos` | Geografía / Transporte | `` | `TABLE(provincia text)` | SECURITY INVOKER | admin_gastos_completos |
| `get_transporte_analisis_geografico` | Geografía / Transporte | `p_transporte_id bigint, p_fecha_inicio date, p_fecha_fin date` | `json` | SECURITY INVOKER | localidades, provincias, gastos |
| `get_transporte_analisis_geografico` | Geografía / Transporte | `p_transporte_ids bigint[], p_provincia_id bigint, p_localidad_ids bigint[], p_fecha_inicio_a date, p_fecha_fin_a date, p_fecha_inicio_b date, p_fecha_fin_b date` | `json` | SECURITY INVOKER | transportes, localidades, provincias, gastos |
| `actualizar_estado_gasto` | Otros | `p_gasto_id bigint, p_nuevo_estado text, p_comentario text` | `void` | SECURITY DEFINER | gastos |
| `admin_update_gasto` | Otros | `p_gasto_id bigint, p_update_payload jsonb` | `void` | SECURITY DEFINER | perfiles, gastos |
| `agrupar_gastos_por_tipo` | Otros | `p_viaje_id bigint` | `text` | SECURITY DEFINER | tipos_gasto_config, grupos_gastos, gastos |
| `aprobar_rechazar_rendicion` | Otros | `p_viaje_id bigint, p_nuevo_estado text, p_comentarios text, p_admin_id uuid` | `text` | SECURITY DEFINER | historial_aprobaciones_rendicion, notificaciones, perfiles, viajes |
| `get_analisis_por_cliente` | Otros | `p_cliente_id bigint` | `jsonb` | SECURITY DEFINER | formatos_gasto_config, localidades, provincias, clientes, perfiles, gastos, viajes |
| `get_dashboard_analisis_rendiciones` | Otros | `p_start_date date, p_end_date date, p_user_id uuid` | `jsonb` | SECURITY INVOKER | tipos_gasto_config, perfiles, gastos, viajes |
| `get_sugerencias_gastos_usuario` | Otros | `` | `TABLE(descripcion_general text, tipo_gasto_id bigint, frecuencia bigint)` | SECURITY DEFINER | gastos |
| `get_usuarios_para_asignacion` | Otros | `p_vehiculo_id bigint` | `TABLE(id uuid, nombre_completo text, email text, esta_asignado boolean)` | SECURITY INVOKER | vehiculo_asignaciones, perfiles |
| `get_viajes_protegidos` | Otros | `` | `SETOF admin_viajes_con_responsable` | SECURITY DEFINER | admin_viajes_con_responsable, perfiles, viajes |
| `limpiar_rendicion_de_prueba` | Otros | `p_viaje_id bigint` | `text` | SECURITY DEFINER | gastos, viajes |
| `get_detalle_rendicion_con_gastos` | Reportes / Rendiciones | `p_viaje_id bigint` | `json` | SECURITY INVOKER | admin_viajes_list_view, admin_gastos_list_view, gastos |
| `get_detalle_rendicion_con_gastos` | Reportes / Rendiciones | `p_viaje_id bigint, p_page integer, p_page_size integer` | `json` | SECURITY INVOKER | vista_gastos_detallados, perfiles, gastos, viajes |
| `get_reporte_caja_completo` | Reportes / Rendiciones | `p_caja_id bigint, p_fecha_desde date, p_fecha_hasta date` | `json` | SECURITY INVOKER | tipos_gasto_config, movimientos_caja, cajas_chicas, localidades, provincias, perfiles, gastos |
| `get_reporte_rendicion_completa` | Reportes / Rendiciones | `p_viaje_id bigint` | `json` | SECURITY INVOKER | tipos_gasto_config, grupos_gastos, transportes, localidades, proveedores, provincias, perfiles, gastos, … |
| `get_reporte_rendicion_config_usuario` | Reportes / Rendiciones | `p_user_id uuid` | `SETOF reporte_rendicion_config` | SECURITY INVOKER | reporte_rendicion_config |
| `get_user_gastos_por_tipo_reporte` | Reportes / Rendiciones | `` | `TABLE(tipo_gasto_nombre text, total_monto numeric)` | SECURITY DEFINER | tipos_gasto_config, gastos |
| `get_user_gastos_por_tipo_reporte` | Reportes / Rendiciones | `p_fecha_desde date, p_fecha_hasta date` | `TABLE(tipo_gasto_nombre text, total_monto numeric)` | SECURITY DEFINER | tipos_gasto_config, gastos |
| `save_reporte_rendicion_config` | Reportes / Rendiciones | `p_user_id uuid, p_nombre_configuracion text, p_campos_visibles jsonb, p_config_id bigint, p_agrupar_por text, p_incluir_resumen_por_categoria boolean, p_incluir_resumen_por_localidad boolean, p_incluir_resumen_por_provincia boolean, p_incluir_resumen_temporal boolean, p_es_default boolean` | `SETOF reporte_rendicion_config` | SECURITY DEFINER | reporte_rendicion_config, perfiles |
| `solicitar_eliminacion_gasto` | Solicitudes / Eliminación | `p_gasto_id bigint, p_motivo text` | `void` | SECURITY INVOKER | solicitudes_eliminacion, gastos |
| `check_gasto_duplicado_contextual` | Triggers / Integridad | `` | `trigger` | SECURITY INVOKER | gastos |
| `notify_low_balance` | Triggers / Integridad | `` | `trigger` | SECURITY DEFINER | notificaciones, cajas_chicas, perfiles |
| `trg_crear_notificacion_cierre_viaje` | Triggers / Integridad | `` | `trigger` | SECURITY DEFINER | notificaciones, perfiles, viajes |
| `can_update_own_profile_check` | Usuarios / Permisos | `old_row perfiles, new_row perfiles` | `boolean` | SECURITY DEFINER | perfiles |
| `get_my_role` | Usuarios / Permisos | `` | `text` | SECURITY DEFINER | perfiles |
| `get_tipos_gasto_permitidos` | Usuarios / Permisos | `` | `TABLE(id bigint, nombre_tipo_gasto text, icono_svg text, color_accent text, es_tipo_transporte boolean)` | SECURITY INVOKER | usuario_tipos_gasto_permitidos, tipos_gasto_config, perfiles |
| `get_user_gastos_evolucion` | Usuarios / Permisos | `p_fecha_desde date, p_fecha_hasta date` | `TABLE(fecha date, total_monto numeric)` | SECURITY DEFINER | gastos |
| `get_user_report_kpis` | Usuarios / Permisos | `` | `jsonb` | SECURITY DEFINER | gastos, viajes |
| `get_user_report_kpis` | Usuarios / Permisos | `p_fecha_desde date, p_fecha_hasta date` | `jsonb` | SECURITY DEFINER | gastos, viajes |
| `get_user_role` | Usuarios / Permisos | `user_id_to_check uuid` | `text` | SECURITY DEFINER | perfiles |
| `handle_new_user` | Usuarios / Permisos | `` | `trigger` | SECURITY DEFINER | perfiles, auth.users |
| `handle_new_user_profile` | Usuarios / Permisos | `` | `trigger` | SECURITY DEFINER | perfiles, auth.users |
| `trigger_check_profile_update_restrictions` | Usuarios / Permisos | `` | `trigger` | SECURITY INVOKER | perfiles |

---

## 8. Funciones `SECURITY DEFINER`

Estas funciones se ejecutan con privilegios del propietario, no necesariamente con los permisos directos del usuario invocador. Requieren revisión cuidadosa de validaciones internas, especialmente si escriben datos o saltan RLS.

| Función | Argumentos | Retorno | Dominio |
| --- | --- | --- | --- |
| `aceptar_gasto_delegado` | `p_caja_id bigint, p_gasto_id bigint, p_viaje_id bigint` | `void` | Delegaciones |
| `actualizar_asignaciones_vehiculo` | `p_vehiculo_id bigint, p_usuarios_asignados_ids uuid[]` | `void` | Flota / Combustible |
| `actualizar_estado_gasto` | `p_gasto_id bigint, p_nuevo_estado text, p_comentario text` | `void` | Otros |
| `add_gastos_to_grupo` | `p_gasto_ids bigint[], p_grupo_id bigint` | `void` | Agrupación |
| `admin_update_gasto` | `p_gasto_id bigint, p_update_payload jsonb` | `void` | Otros |
| `agrupar_gastos_por_tipo` | `p_viaje_id bigint` | `text` | Otros |
| `ajustar_saldo_caja_manual` | `p_caja_id bigint, p_monto_ajuste numeric, p_descripcion text, p_realizado_por_id uuid` | `json` | Caja chica |
| `aprobar_rechazar_rendicion` | `p_viaje_id bigint, p_nuevo_estado text, p_comentarios text, p_admin_id uuid` | `text` | Otros |
| `can_update_own_profile_check` | `old_row perfiles, new_row perfiles` | `boolean` | Usuarios / Permisos |
| `crear_banco_al_vuelo` | `p_nombre_banco text` | `bigint` | Catálogos / Alta al vuelo |
| `crear_entidad_al_vuelo` | `p_nombre_entidad text, p_nombre_tabla text` | `bigint` | Catálogos / Alta al vuelo |
| `crear_gasto_delegado` | `payload jsonb` | `jsonb` | Delegaciones |
| `crear_localidad_al_vuelo` | `p_nombre_localidad text, p_provincia_id bigint` | `bigint` | Geografía / Transporte |
| `crear_notificacion_delegacion` | `p_receptor_id uuid, p_mensaje text, p_link text` | `void` | Delegaciones |
| `delete_grupo_gasto` | `p_grupo_id bigint` | `void` | Agrupación |
| `get_admin_analytics_dashboard` | `` | `jsonb` | Analytics / Admin |
| `get_admin_analytics_dashboard` | `p_start_date date, p_end_date date` | `jsonb` | Analytics / Admin |
| `get_analisis_por_cliente` | `p_cliente_id bigint` | `jsonb` | Otros |
| `get_count_cajas_activas` | `` | `integer` | Analytics / Admin |
| `get_evolucion_gastos_ars_periodo_anterior` | `p_fecha_inicio date, p_fecha_fin date, p_agrupador text` | `TABLE(periodo_label text, total_gastado_bruto numeric)` | Analytics / Admin |
| `get_gastos_por_cliente` | `p_fecha_inicio date, p_fecha_fin date` | `TABLE(cliente_nombre text, total_gastado numeric)` | Analytics / Admin |
| `get_gastos_por_responsable` | `p_fecha_inicio date, p_fecha_fin date` | `TABLE(responsable_nombre text, total_gastado numeric)` | Analytics / Admin |
| `get_mi_historial_delegaciones_enviadas` | `` | `TABLE(id bigint, decision text, motivo_rechazo text, fecha_decision timestamp with time zone, monto_gasto numeric, descripcion_gasto text, nombre_receptor text)` | Delegaciones |
| `get_mis_delegaciones_enviadas_pendientes` | `` | `TABLE(id bigint, monto_total numeric, descripcion_general text, fecha_gasto date, created_at timestamp with time zone, receptor_nombre text, receptor_email text)` | Delegaciones |
| `get_my_role` | `` | `text` | Usuarios / Permisos |
| `get_sugerencias_gastos_usuario` | `` | `TABLE(descripcion_general text, tipo_gasto_id bigint, frecuencia bigint)` | Otros |
| `get_user_gastos_evolucion` | `p_fecha_desde date, p_fecha_hasta date` | `TABLE(fecha date, total_monto numeric)` | Usuarios / Permisos |
| `get_user_gastos_por_tipo_reporte` | `` | `TABLE(tipo_gasto_nombre text, total_monto numeric)` | Reportes / Rendiciones |
| `get_user_gastos_por_tipo_reporte` | `p_fecha_desde date, p_fecha_hasta date` | `TABLE(tipo_gasto_nombre text, total_monto numeric)` | Reportes / Rendiciones |
| `get_user_report_kpis` | `` | `jsonb` | Usuarios / Permisos |
| `get_user_report_kpis` | `p_fecha_desde date, p_fecha_hasta date` | `jsonb` | Usuarios / Permisos |
| `get_user_role` | `user_id_to_check uuid` | `text` | Usuarios / Permisos |
| `get_viajes_protegidos` | `` | `SETOF admin_viajes_con_responsable` | Otros |
| `handle_new_user` | `` | `trigger` | Usuarios / Permisos |
| `handle_new_user_profile` | `` | `trigger` | Usuarios / Permisos |
| `limpiar_rendicion_de_prueba` | `p_viaje_id bigint` | `text` | Otros |
| `notify_low_balance` | `` | `trigger` | Triggers / Integridad |
| `obtener_gastos_para_bandeja_delegados` | `p_user_id uuid` | `SETOF gastos` | Delegaciones |
| `obtener_gastos_recibidos` | `p_user_id uuid` | `SETOF gastos` | Delegaciones |
| `obtener_mi_historial_delegaciones` | `` | `TABLE(id bigint, gasto_id bigint, decision text, motivo_rechazo text, fecha_decision timestamp with time zone, monto_gasto numeric, descripcion_gasto text, nombre_delegador text)` | Delegaciones |
| `rechazar_gasto_delegado` | `p_gasto_id bigint` | `void` | Delegaciones |
| `rechazar_gasto_delegado` | `p_gasto_id bigint, p_motivo_rechazo text` | `void` | Delegaciones |
| `registrar_carga_combustible` | `p_vehiculo_id bigint, p_fecha_carga date, p_litros numeric, p_monto_total numeric, p_odometro_actual integer, p_proveedor_id bigint, p_conductor_id uuid` | `jsonb` | Flota / Combustible |
| `registrar_carga_combustible` | `p_vehiculo_id bigint, p_fecha_carga date, p_litros numeric, p_monto_total numeric, p_odometro_actual integer, p_proveedor_id bigint, p_conductor_id uuid, p_numero_comprobante text, p_descripcion text` | `jsonb` | Flota / Combustible |
| `registrar_gasto_caja_chica` | `p_gasto_id bigint, p_caja_id bigint` | `TABLE(success boolean, message text, new_saldo numeric, new_deuda_responsable numeric, replenishment_needed boolean)` | Caja chica |
| `registrar_gasto_combustible_unificado` | `p_vehiculo_id bigint, p_fecha_carga date, p_litros numeric, p_monto_total numeric, p_odometro_actual integer, p_proveedor_id bigint, p_numero_comprobante text, p_descripcion text, p_viaje_id bigint, p_caja_id bigint, p_user_id uuid` | `jsonb` | Flota / Combustible |
| `registrar_gasto_combustible_unificado` | `p_vehiculo_id bigint, p_fecha_carga date, p_litros numeric, p_monto_total numeric, p_odometro_actual integer, p_proveedor_id bigint, p_numero_comprobante text, p_descripcion text, p_viaje_id bigint, p_caja_id bigint, p_user_id uuid, p_conductor_id uuid` | `jsonb` | Flota / Combustible |
| `rename_grupo_gasto` | `p_grupo_id bigint, p_nuevo_nombre text` | `void` | Agrupación |
| `save_reporte_rendicion_config` | `p_user_id uuid, p_nombre_configuracion text, p_campos_visibles jsonb, p_config_id bigint, p_agrupar_por text, p_incluir_resumen_por_categoria boolean, p_incluir_resumen_por_localidad boolean, p_incluir_resumen_por_provincia boolean, p_incluir_resumen_temporal boolean, p_es_default boolean` | `SETOF reporte_rendicion_config` | Reportes / Rendiciones |
| `trg_crear_notificacion_cierre_viaje` | `` | `trigger` | Triggers / Integridad |

### Pautas para auditoría

Para cada `SECURITY DEFINER`, se recomienda verificar:

1. si valida explícitamente rol o identidad del usuario;
2. si limita el alcance de filas afectadas;
3. si usa `auth.uid()` o parámetros confiables;
4. si escribe en tablas críticas (`gastos`, `viajes`, `movimientos_caja`, `registros_combustible`);
5. si su `search_path` está definido de forma segura en el DDL, cuando corresponda.

---

## 9. Agrupación funcional de RPCs

| Dominio | Cantidad |
| --- | ---: |
| Analytics / Admin | 34 |
| Delegaciones | 10 |
| Usuarios / Permisos | 10 |
| Otros | 10 |
| Reportes / Rendiciones | 8 |
| Flota / Combustible | 8 |
| Geografía / Transporte | 6 |
| Caja chica | 4 |
| Agrupación | 3 |
| Triggers / Integridad | 3 |
| Catálogos / Alta al vuelo | 2 |
| Solicitudes / Eliminación | 1 |

### Lectura por dominio

- **Analytics / Admin:** alta densidad de funciones. El sistema ya contiene una capa analítica amplia.
- **Delegaciones:** flujo maduro y respaldado por múltiples RPCs.
- **Usuarios / Permisos:** coexisten helpers de rol, perfiles y permisos por tipos/formato.
- **Flota / Combustible:** existe backend específico para registrar y analizar combustible.
- **Reportes / Rendiciones:** hay funciones específicas para reportes operativos y configurables.

---

## 10. Observaciones técnicas y riesgos

### 10.1. Sobrecarga de funciones
Hay 10 nombres sobrecargados. Es recomendable:
- evitar crear nuevas firmas sin retirar las antiguas;
- documentar qué firma consume cada componente;
- revisar especialmente `filtrar_gastos_admin`.

### 10.2. Alto uso de `SECURITY DEFINER`
El 50,5% de las funciones públicas usa `SECURITY DEFINER`. Esto no es incorrecto, pero exige una política clara de:
- validación de rol,
- validación de ownership,
- uso controlado de parámetros,
- revisión periódica.

### 10.3. Vistas administrativas como contrato implícito
Vistas como `admin_gastos_completos`, `admin_gastos_list_view` y `vista_gastos_detallados` actúan como **contrato de datos** para frontend y RPCs. Cambios en columnas, alias o joins deben tratarse como breaking changes.

### 10.4. Funciones de reporte y analítica con múltiples fuentes
El backend concentra lógica compleja para:
- rendiciones,
- cajas,
- transporte,
- flota,
- dashboards,
- reportes de usuario.

Esto es positivo para consistencia, pero aumenta la necesidad de:
- versionado de RPCs;
- tests manuales de regresión;
- control de migraciones.

### 10.5. Funciones de trigger como lógica oculta
Parte del comportamiento del sistema no se observa solo leyendo frontend o RPCs:
- notificaciones automáticas,
- bloqueo de duplicados,
- restricciones de perfiles,
- aviso por cierre de viaje.

Estas funciones deben revisarse siempre que se modifiquen procesos relacionados.

---

## 11. Recomendaciones de gobernanza técnica

1. **Definir un estándar para RPCs públicas**
   - nombre,
   - contrato de parámetros,
   - retorno,
   - seguridad,
   - owner,
   - consumidores frontend.

2. **Evitar overloads salvo necesidad estricta**
   - Si se reemplaza una firma, ejecutar `DROP FUNCTION IF EXISTS ...` de la firma antigua.

3. **Crear matriz de consumo frontend ↔ RPC**
   - qué componente llama a qué función,
   - con qué payload,
   - qué espera de retorno.

4. **Auditar `SECURITY DEFINER`**
   - revisar todas las funciones de escritura y permisos.

5. **Separar funciones de analítica obsoletas o duplicadas**
   - el catálogo muestra varias familias de funciones con posible solapamiento.

---

## 12. Fuentes de evidencia

Este documento fue construido a partir de:

- `Supabase Snippet List Public Views with Definitions.csv`
- `Supabase Snippet List Public Functions and Definitions.csv`
- `Supabase Snippet Untitled query (2).csv` *(export de triggers)*

Las definiciones completas de cada vista y función permanecen disponibles en los exports originales.

---

## 13. Próximo documento recomendado

El siguiente documento técnico prioritario es:

`SUPABASE_RLS_SECURITY_MATRIX.md`

Debe consolidar:
- tablas con RLS habilitado,
- políticas por tabla,
- `USING`,
- `WITH CHECK`,
- roles,
- acciones,
- puntos de riesgo.

