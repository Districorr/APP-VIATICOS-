# SUPABASE_BACKEND_ARCHITECTURE.md

## Arquitectura de Backend Supabase — InfoGastos Districorr

**Versión:** 2.0  
**Fecha de actualización:** 2026-05-12  
**Estado:** Documento actualizado con metadatos reales de Supabase y documentación técnica consolidada.

---

## 1. Propósito

Este documento describe la arquitectura backend de InfoGastos sobre Supabase/PostgreSQL.

Funciona como **resumen ejecutivo técnico** del backend.  
Los catálogos exhaustivos viven en:

- `DATABASE_SCHEMA_AND_RELATIONSHIPS_FINAL.md`
- `SUPABASE_RPCS_VIEWS_TRIGGERS_CATALOG.md`
- `SUPABASE_RLS_SECURITY_MATRIX.md`

---

## 2. Fotografía real del backend

| Objeto | Cantidad confirmada |
| --- | ---: |
| Tablas públicas | 26 |
| Foreign Keys | 54 |
| Constraints | 108 |
| Índices | 56 |
| Views públicas | 9 |
| Funciones / RPCs públicas | 99 |
| Triggers públicos | 5 |
| Políticas RLS | 75 |

---

## 3. Filosofía de backend

El backend sigue un enfoque de:

> **Base de datos relacional con lógica de negocio server-side.**

Supabase/PostgreSQL concentra:

- integridad;
- relaciones;
- validaciones;
- automatizaciones;
- cálculos complejos;
- seguridad;
- parte de la orquestación operativa.

El frontend consume:

- tablas protegidas por RLS;
- views;
- RPCs;
- autenticación.

---

## 4. Organización lógica del esquema

### 4.1. Usuarios y permisos

| Tabla | Propósito |
| --- | --- |
| `perfiles` | Perfil extendido y rol |
| `usuario_formatos_permitidos` | Permisos por formato |
| `usuario_tipos_gasto_permitidos` | Permisos por tipo de gasto |
| `notificaciones` | Avisos internos |

### 4.2. Rendiciones y gastos

| Tabla | Propósito |
| --- | --- |
| `viajes` | Rendiciones |
| `gastos` | Gasto individual |
| `grupos_gastos` | Agrupaciones dentro de rendiciones |
| `historial_aprobaciones_rendicion` | Auditoría de aprobación |
| `historial_delegaciones` | Auditoría de delegación |
| `solicitudes_eliminacion` | Solicitudes de borrado |

### 4.3. Caja chica

| Tabla | Propósito |
| --- | --- |
| `cajas_chicas` | Estado financiero de cada caja |
| `movimientos_caja` | Libro de movimientos |
| `solicitudes_reposicion` | Pedidos de reposición |

### 4.4. Configuración de carga

| Tabla | Propósito |
| --- | --- |
| `formatos_gasto_config` | Formatos de gasto |
| `campos_formato_config` | Campos dinámicos |
| `tipos_gasto_config` | Tipos/categorías de gasto |

### 4.5. Catálogos

| Tabla | Propósito |
| --- | --- |
| `clientes` | Clientes referidos |
| `proveedores` | Proveedores |
| `transportes` | Transportes |
| `bancos` | Bancos |
| `provincias` | Provincias |
| `localidades` | Localidades |

### 4.6. Flota

| Tabla | Propósito |
| --- | --- |
| `vehiculos` | Vehículos |
| `vehiculo_asignaciones` | Asignaciones |
| `registros_combustible` | Cargas de combustible |

### 4.7. Reportes

| Tabla | Propósito |
| --- | --- |
| `reporte_rendicion_config` | Configuraciones personalizadas de reporte |

---

## 5. Tabla central: `gastos`

`gastos` es el corazón del sistema.

### 5.1. Relaciones principales

Se vincula con:

- `viajes`
- `cajas_chicas`
- `vehiculos`
- `tipos_gasto_config`
- `formatos_gasto_config`
- `clientes`
- `proveedores`
- `transportes`
- `grupos_gastos`
- `localidades`
- `provincias`
- `perfiles`
- `auth.users`

### 5.2. Reglas críticas

#### Exclusividad de origen

Confirmada por constraint:

```sql
CHECK ((
CASE WHEN viaje_id IS NOT NULL THEN 1 ELSE 0 END +
CASE WHEN caja_id IS NOT NULL THEN 1 ELSE 0 END +
CASE WHEN vehiculo_id IS NOT NULL THEN 1 ELSE 0 END
) <= 1)
```

Esto impide múltiples orígenes simultáneos, pero no obliga a que exista uno.

#### Estados de delegación

- `directo`
- `pendiente_aceptacion`
- `aceptado`
- `rechazado`

#### Estados de revisión

- `en_revision`
- `aprobado`
- `observado`

#### Factura única por proveedor

- `UNIQUE(numero_factura, proveedor_id)`

---

## 6. Relaciones delicadas

### 6.1. `viajes.user_id`

Referencia a:

- `auth.users(id)`

No a `perfiles(id)`.

### 6.2. `gastos.user_id`

Tiene dos FKs confirmadas:

- `auth.users(id)` con cascade;
- `perfiles(id)` con set null.

Esto debe revisarse con especial cuidado ante migraciones.

### 6.3. `gastos.viaje_id`

Tiene:

- `ON DELETE CASCADE`

Eliminar un viaje puede eliminar gastos asociados.

---

## 7. Views

Las views simplifican lecturas complejas y desacoplan al frontend de joins repetitivos.

### 7.1. Views críticas

| View | Rol |
| --- | --- |
| `admin_gastos_completos` | Consolidación principal para analytics/admin |
| `movimientos_caja_detalle` | Lectura enriquecida de movimientos de caja |

### 7.2. Riesgos

- `admin_gastos_completos` es altamente dependida.
- Un cambio en aliases o joins puede romper:
  - analytics;
  - reportes operativos;
  - exportaciones;
  - filtros.

Detalle exhaustivo:

- `SUPABASE_RPCS_VIEWS_TRIGGERS_CATALOG.md`

---

## 8. Funciones y RPCs

### 8.1. Uso de RPCs

Las RPCs cubren:

- filtrado administrativo;
- aprobación/rechazo;
- delegaciones;
- caja chica;
- reportes;
- transportes;
- combustible;
- configuraciones.

### 8.2. RPCs críticas

| RPC | Rol |
| --- | --- |
| `filtrar_gastos_admin(...)` | Filtros avanzados y analytics |
| `get_reporte_rendicion_completa(...)` | Reporte de rendición |
| `get_reporte_caja_completo(...)` | Reporte de caja |
| `get_transporte_analisis_geografico(...)` | Mapa y análisis de transportes |
| `ajustar_saldo_caja_manual(...)` | Ajuste/admin de caja |
| `aprobar_rechazar_rendicion(...)` | Flujo de aprobación |
| `aceptar_gasto_delegado(...)` | Delegación |
| `rechazar_gasto_delegado(...)` | Delegación |
| `save_reporte_rendicion_config(...)` | Configuración de reportes |

### 8.3. Riesgo de overloads

Se confirmó la existencia de nombres de funciones con múltiples firmas activas.  
El caso más sensible es:

- `filtrar_gastos_admin(...)`

Este punto debe ser tratado como riesgo prioritario.

---

## 9. Triggers

Los triggers automatizan eventos y validaciones.

### Triggers principales documentados

| Trigger | Tabla | Rol |
| --- | --- | --- |
| `on_viaje_closed` | `viajes` | Notificar cierre a admins |
| `trg_caja_saldo_bajo` | `cajas_chicas` | Notificar saldo bajo |
| `trg_check_gasto_duplicado_contextual` | `gastos` | Prevenir duplicados |
| `trg_before_profile_update_restrictions` | `perfiles` | Validaciones previas de perfil |
| Trigger adicional consolidado en catálogo | Según export | Ver catálogo técnico |

Para detalle exacto:

- `SUPABASE_RPCS_VIEWS_TRIGGERS_CATALOG.md`

---

## 10. Seguridad y RLS

La auditoría consolidada detectó:

| Métrica | Valor |
| --- | ---: |
| Tablas con RLS habilitado | 14 |
| Tablas sin RLS habilitado | 12 |
| Políticas RLS | 75 |
| Tablas con RLS forzado | 1 (`perfiles`) |

### 10.1. Patrones

- `gastos` y `viajes` poseen matrices complejas de políticas.
- `perfiles` tiene RLS forzado.
- catálogos poseen lecturas relativamente amplias.
- `movimientos_caja` se lee por políticas específicas y aparenta depender de RPCs para escritura.

### 10.2. Tablas sin RLS a revisar

- `vehiculos`
- `vehiculo_asignaciones`
- `registros_combustible`
- `reporte_rendicion_config`
- `solicitudes_reposicion`
- `solicitudes_eliminacion`
- `historial_aprobaciones_rendicion`
- `usuario_tipos_gasto_permitidos`
- otras tablas públicas sin RLS según la matriz consolidada.

Detalle completo:

- `SUPABASE_RLS_SECURITY_MATRIX.md`

---

## 11. Seguridad de funciones

### 11.1. `SECURITY DEFINER`

Algunas funciones requieren privilegios elevados.  
Debe verificarse que:

- controlen rol internamente;
- limiten inputs;
- no permitan bypass no previsto de RLS.

### 11.2. `SECURITY INVOKER`

Se usa en funciones que deben respetar el contexto del usuario.

---

## 12. Puntos técnicos confirmados tras auditoría real

| Tema | Confirmación |
| --- | --- |
| Esquema real | 26 tablas públicas |
| Modelo de relaciones | 54 FKs |
| RPCs | 99 funciones |
| RLS | 75 políticas |
| Índice default de reportes | Confirmado |
| Constraint de origen de gasto | Confirmado |
| FK de viaje a auth.users | Confirmada |
| CASCADE de `gastos.viaje_id` | Confirmado |

---

## 13. Riesgos de backend

### Alta prioridad

1. Overloads de funciones.
2. Redundancia RLS.
3. Tablas sin RLS.
4. Acople de vistas críticas.
5. Complejidad de `gastos`.
6. Dependencia de reportes sobre JSON de RPCs.
7. Ausencia o debilidad de estrategia formal de migrations si el esquema se sigue modificando manualmente.

---

## 14. Recomendaciones de gobierno técnico

1. Adoptar migraciones versionadas.
2. Antes de reemplazar una RPC:
   - revisar firmas existentes;
   - hacer `DROP FUNCTION` explícito si corresponde.
3. No modificar `admin_gastos_completos` sin regression checklist.
4. Revisar RLS de tablas sin protección.
5. Evitar agregar lógica de negocio compleja solo en frontend.
6. Actualizar documentación técnica tras cada cambio backend.

---

## 15. Relación con documentación complementaria

| Necesidad | Documento |
| --- | --- |
| Ver tablas, columnas, FK, constraints | `DATABASE_SCHEMA_AND_RELATIONSHIPS_FINAL.md` |
| Ver RPCs, views y triggers | `SUPABASE_RPCS_VIEWS_TRIGGERS_CATALOG.md` |
| Ver RLS | `SUPABASE_RLS_SECURITY_MATRIX.md` |
| Ver flujo UI ↔ backend | `FRONTEND_BACKEND_DATA_FLOW.md` |
| Ver estado de madurez | `CURRENT_IMPLEMENTATION_STATUS.md` |

---

## 16. Conclusión

El backend de InfoGastos es amplio, relacional y funcionalmente rico.  
La auditoría real confirma que el proyecto cuenta con una base avanzada, pero también con puntos sensibles que requieren disciplina técnica.

Este documento debe mantenerse como **síntesis arquitectónica del backend**, mientras que los catálogos técnicos específicos actúan como fuente de detalle exhaustivo.
## 17. Nota de backend aplicada (2026-06-01)
- Se mantiene el patron de operaciones administrativas via RPC para gastos de cuenta corriente y alta de proveedores (sin escritura directa FE sobre tablas criticas).
- RPCs utilizadas por frontend admin: `admin_actualizar_gasto_cuenta_corriente` y `admin_crear_proveedor_basico`.
- Se mantiene la regla funcional de no alterar en este flujo: `viaje_id`, `caja_id`, `vehiculo_id`, `origen_gasto`, `estado_delegacion`.
