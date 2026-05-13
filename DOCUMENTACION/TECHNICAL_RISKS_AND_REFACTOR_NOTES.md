# TECHNICAL_RISKS_AND_REFACTOR_NOTES.md

## Riesgos Técnicos y Notas de Refactorización — InfoGastos Districorr

**Versión:** 2.0  
**Fecha de actualización:** 2026-05-12  
**Estado:** Riesgos actualizados con base en documentación técnica real de esquema, RPCs, RLS y flujos.

---

## 1. Propósito

Este documento centraliza riesgos técnicos, deuda de arquitectura y oportunidades de refactor.

Los riesgos se clasifican por:

- impacto;
- probabilidad;
- urgencia;
- área afectada;
- recomendación.

---

## 2. Matriz ejecutiva de riesgos

| Riesgo | Nivel |
| --- | --- |
| Sobrecarga / múltiples firmas de RPCs | Alto |
| Complejidad estructural de `gastos` | Alto |
| Políticas RLS redundantes | Alto |
| Tablas públicas sin RLS | Alto |
| Acople de reportes a shapes JSON de RPCs | Alto |
| Dependencia de `admin_gastos_completos` | Alto |
| Gestión no formalizada de migraciones | Alto |
| Configuración de reportes parcialmente cerrada | Medio-Alto |
| Reportes operativos con Edge Function incompleta | Medio-Alto |
| Módulo de flota con backend adelantado respecto al producto | Medio-Alto |
| Componentes frontend de alta responsabilidad | Medio |
| Duplicación de llamadas/servicios admin | Medio |
| Geografía dependiente de coordenadas manuales | Medio |

---

## 3. Riesgos backend críticos

### 3.1. Sobrecarga de funciones RPC

**Nivel:** Alto

#### Descripción
El catálogo consolidado confirma múltiples funciones con nombres repetidos y distintas firmas.  
El caso más sensible es:

- `filtrar_gastos_admin(...)`

#### Impacto
- ambigüedad de invocación;
- errores de PostgREST/Supabase;
- ruptura de analytics;
- ruptura de reportes operativos;
- mantenimiento difícil.

#### Recomendación
- estandarizar una firma única por caso de uso;
- eliminar overloads innecesarios;
- usar `DROP FUNCTION IF EXISTS ...` con firma completa antes de reemplazos;
- documentar firmas activas en changelog.

---

### 3.2. Tabla `gastos` como núcleo de alta complejidad

**Nivel:** Alto

#### Descripción
`gastos` posee:

- 39 columnas;
- múltiples FKs;
- varios estados;
- relación con rendiciones, caja, flota y delegaciones;
- geografía;
- agrupaciones;
- proveedor/cliente/transporte;
- reportes y analytics.

#### Impacto
Cualquier cambio puede afectar:

- alta/edición;
- delegación;
- reportes;
- analytics;
- caja chica;
- filtros;
- exportaciones.

#### Recomendación
- no modificar `gastos` sin Spec;
- revisar siempre impacto en:
  - `FRONTEND_BACKEND_DATA_FLOW.md`;
  - views;
  - RPCs;
  - RLS;
- mantener checklist de regresión.

---

### 3.3. Políticas RLS redundantes

**Nivel:** Alto

#### Descripción
La matriz consolidada muestra múltiples políticas equivalentes o solapadas en:

- `viajes`;
- `gastos`;
- configuraciones;
- pivotes de permisos.

#### Impacto
- reglas difíciles de auditar;
- mayor riesgo de accesos no previstos;
- confusión al modificar seguridad;
- posibilidad de políticas viejas que sigan habilitando comportamientos.

#### Recomendación
- consolidar políticas equivalentes;
- evitar duplicación bilingüe o histórica si ya no aporta valor;
- construir una matriz de comportamiento esperada por rol y operación;
- validar con pruebas de RLS.

---

### 3.4. Tablas públicas sin RLS habilitado

**Nivel:** Alto

#### Tablas a revisar prioritariamente
- `vehiculos`
- `vehiculo_asignaciones`
- `registros_combustible`
- `reporte_rendicion_config`
- `solicitudes_reposicion`
- `solicitudes_eliminacion`
- `historial_aprobaciones_rendicion`
- `usuario_tipos_gasto_permitidos`

#### Impacto
La ausencia de RLS no prueba exposición indebida por sí sola, pero obliga a revisar:

- grants;
- exposición por API;
- uso directo desde frontend;
- si el acceso debe quedar mediado por RPCs.

#### Recomendación
Realizar auditoría específica de seguridad por tabla:

1. ¿La tabla se consulta desde frontend?
2. ¿Tiene grants a `anon` o `authenticated`?
3. ¿Debería protegerse con RLS?
4. ¿Debe migrar a esquema privado?

---

### 3.5. Dependencia de `admin_gastos_completos`

**Nivel:** Alto

#### Descripción
La view es consumida por:

- Exploración Avanzada;
- reportes operativos;
- exportaciones;
- potenciales analíticas adicionales.

#### Impacto
Un cambio en:

- aliases;
- columnas;
- joins;
- comportamiento de nulls;

puede romper varios módulos.

#### Recomendación
- documentar contract de salida;
- evitar cambios sin regression test;
- considerar views especializadas si la vista sigue creciendo;
- evaluar performance con volumen.

---

### 3.6. Reportes acoplados a shapes de RPC

**Nivel:** Alto

#### Descripción
Los PDFs dependen de outputs JSON de:

- `get_reporte_rendicion_completa(...)`
- `get_reporte_caja_completo(...)`

#### Impacto
Modificar la RPC puede romper:

- PDF final;
- vista previa;
- agrupaciones;
- subtotales;
- campos personalizados.

#### Recomendación
- definir contratos versionados de salida;
- incluir fixtures de reporte;
- hacer QA visual comparativo tras cambios.

---

### 3.7. Gestión de migraciones

**Nivel:** Alto

#### Descripción
La documentación previa ya señalaba que parte del trabajo se hizo desde SQL Editor sin un sistema robusto de migrations.

#### Impacto
- ambientes no reproducibles;
- dificultad para versionar;
- riesgo de divergencia producción/desarrollo;
- pérdida de trazabilidad.

#### Recomendación
Adoptar flujo formal:

- `supabase db pull`
- migrations versionadas
- revisión de cambios de schema
- changelog técnico obligatorio

---

## 4. Riesgos funcionales / de reglas de negocio

### 4.1. Exclusividad de origen en `gastos`

**Nivel:** Medio-Alto

#### Hallazgo
El constraint confirmado permite:

- cero o un origen;

no exactamente uno.

#### Impacto
Un gasto podría quedar sin origen si otra capa no lo impide.

#### Recomendación
- validar si es comportamiento deseado;
- si no lo es, endurecer lógica por RPC o constraint;
- documentar explícitamente la regla de negocio.

---

### 4.2. Delegación de gastos

**Nivel:** Alto

#### Descripción
El flujo mezcla:

- ownership operativo;
- usuario creador;
- usuario receptor;
- historial;
- notificaciones;
- estados.

#### Riesgo
Cambios parciales pueden romper trazabilidad o permisos.

#### Recomendación
- no tocar sin Spec;
- verificar inserción de `pendiente_aceptacion`;
- auditar políticas RLS asociadas.

---

### 4.3. Caja chica y movimientos

**Nivel:** Alto

#### Descripción
El sistema controla saldos y deuda del responsable.

#### Riesgo
Desacople entre:

- `gastos`;
- `cajas_chicas`;
- `movimientos_caja`;
- `solicitudes_reposicion`.

#### Recomendación
- usar RPCs para operaciones sensibles;
- evitar writes directos no controlados;
- mantener auditoría.

---

## 5. Riesgos frontend

### 5.1. Componentes “dios”

**Nivel:** Medio

#### Candidatos
- `GastoForm.vue`
- `GastosListView.vue`
- `ExploracionAvanzadaTab.vue`

#### Recomendación
Extraer lógica a composables específicos cuando continúen creciendo.

---

### 5.2. `useReportGenerator.js`

**Nivel:** Medio

#### Riesgo
Puede transformarse en un módulo monolítico de PDF.

#### Recomendación
Separar por dominio:

- rendiciones;
- caja;
- admin/reportes operativos.

---

### 5.3. Duplicidad de lógica admin

**Nivel:** Medio

#### Descripción
La llamada a `filtrar_gastos_admin(...)` y procesamiento de filtros puede repetirse entre:

- exploración avanzada;
- reportes operativos.

#### Recomendación
Crear servicio/composable unificado, por ejemplo:

- `useAdminApi.js`
- `useAdvancedFilters.js`

---

## 6. Riesgos de módulos parciales

### 6.1. Configuración de reportes

**Nivel:** Medio-Alto

Persistencia y backend existen, pero se debe verificar la aplicación completa de la configuración en PDFs.

---

### 6.2. Reportes operativos

**Nivel:** Medio-Alto

La Edge Function `send-report` fue documentada con generación placeholder.  
Debe completarse antes de tratar el flujo como estable.

---

### 6.3. Flota

**Nivel:** Medio-Alto

El backend ya tiene:

- vehículos;
- asignaciones;
- combustible;
- vínculo con gastos.

Pero el producto completo aún parece evolucionar.

---

## 7. Riesgos de performance

### 7.1. `filtrar_gastos_admin(...)`

Riesgo de degradación con crecimiento de `gastos`.

### 7.2. `admin_gastos_completos`

Puede transformarse en cuello de botella de joins y filtros.

### 7.3. Exportaciones grandes

El procesamiento masivo del lado frontend puede escalar mal.

#### Recomendación
- RPCs agregadoras;
- paginado robusto;
- export batch;
- monitoreo de tiempos.

---

## 8. Acciones recomendadas por prioridad

### Alta prioridad

1. Auditoría de overloads de RPCs.
2. Revisión de RLS en tablas sin protección.
3. Consolidación de políticas redundantes.
4. Revisión de contract de `admin_gastos_completos`.
5. Verificación de reportes configurables.
6. Formalización de migrations.

### Media prioridad

1. Refactor de componentes grandes.
2. Servicio único de llamadas admin.
3. Optimización de reportes grandes.
4. Revisión de módulo de flota.

---

## 9. Checklist de riesgo antes de una feature

| Pregunta | Revisado |
| --- | --- |
| ¿Toca `gastos`? |  |
| ¿Toca `viajes`? |  |
| ¿Toca `filtrar_gastos_admin(...)`? |  |
| ¿Afecta una view crítica? |  |
| ¿Requiere nueva RLS? |  |
| ¿Modifica reportes? |  |
| ¿Impacta caja o delegación? |  |
| ¿Actualiza documentación técnica? |  |

---

## 10. Conclusión

La arquitectura actual es potente y ya soporta un producto serio, pero la complejidad creció.  
Los principales riesgos no provienen de falta de funcionalidad, sino de:

- acople;
- duplicación;
- seguridad;
- deuda de mantenimiento.

Este documento debe usarse como **radar de riesgo** antes de implementar cambios relevantes.
