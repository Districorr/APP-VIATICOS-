# OPEN_QUESTIONS_AND_VERIFICATION_PENDING.md

## Preguntas Abiertas y Verificaciones Pendientes — InfoGastos Districorr

**Versión:** 2.0  
**Fecha de actualización:** 2026-05-12  
**Estado:** Documento actualizado tras la consolidación real de esquema, RPCs, RLS y flujos FE/BE.

---

## 1. Propósito

Este archivo registra:

- decisiones de negocio aún abiertas;
- verificaciones técnicas pendientes;
- puntos que requieren validación del Product Owner;
- riesgos que necesitan una decisión explícita antes de ser modificados.

---

## 2. Preguntas de negocio abiertas

### 2.1. Prioridad de grupos personalizados en reportes

**Pregunta:**  
Si un gasto pertenece a un grupo personalizado y además a una categoría de gasto que podría integrarse en un agrupamiento estándar, ¿qué criterio debe prevalecer en el reporte?

**Hipótesis actual:**  
El grupo personalizado tiene prioridad.

**Estado:**  
Pendiente de confirmación de negocio.

---

### 2.2. Reportes programados ante entidades eliminadas

**Pregunta:**  
Si un reporte programado guarda filtros y luego se elimina una entidad filtrada —por ejemplo, un cliente—, ¿qué debe ocurrir?

Opciones posibles:

1. generar el reporte ignorando la entidad faltante;
2. bloquear la ejecución;
3. mostrar advertencia y continuar;
4. conservar snapshot de etiqueta/nombre además del ID.

**Estado:**  
Pendiente de decisión funcional.

---

### 2.3. Gasto sin origen

**Hallazgo técnico:**  
El constraint de `gastos` confirma que puede existir **cero o un origen** entre:

- `viaje_id`
- `caja_id`
- `vehiculo_id`

**Pregunta:**  
¿Es deseado permitir gastos sin origen, o debería existir exactamente un origen en el flujo definitivo?

**Estado:**  
Pendiente de validación de negocio y técnica.

---

### 2.4. Alcance final del módulo de flota

El backend ya posee:

- `vehiculos`;
- `vehiculo_asignaciones`;
- `registros_combustible`;
- `gastos.vehiculo_id`.

**Pregunta:**  
¿Cuál será el alcance real del módulo de flota en el producto?

- solo combustible;
- gastos asociados;
- dashboard de costo por kilómetro;
- mantenimiento;
- asignación operativa de responsables.

**Estado:**  
Pendiente de definición de roadmap.

---

## 3. Verificaciones técnicas pendientes

### 3.1. Aplicación completa de configuración personalizada de reportes

**Contexto:**  
Existe:

- `reporte_rendicion_config`;
- RPC de guardado;
- UI de configuración;
- índice único de default.

**Pendiente:**  
Verificar en código si `generateCanvaStylePDF` aplica plenamente la configuración seleccionada.

**Estado:**  
Pendiente de auditoría funcional en repositorio.

---

### 3.2. Edge Function `send-report`

**Contexto:**  
La documentación previa la describe como parcialmente implementada, con PDF placeholder.

**Pendiente:**  
Verificar:

- estado actual del archivo;
- librería final a utilizar;
- compatibilidad con PDF frontend;
- si el flujo de programación está operativo o es exploratorio.

**Estado:**  
Pendiente.

---

### 3.3. Exposición real de tablas sin RLS

La auditoría consolidada detectó 12 tablas públicas sin RLS habilitado.

**Pendiente:**  
Verificar:

- grants por rol;
- si se consumen directamente desde frontend;
- si están expuestas por Data API;
- si deben habilitar RLS.

**Tablas prioritarias:**

- `vehiculos`
- `vehiculo_asignaciones`
- `registros_combustible`
- `reporte_rendicion_config`
- `solicitudes_reposicion`
- `solicitudes_eliminacion`
- `historial_aprobaciones_rendicion`
- `usuario_tipos_gasto_permitidos`

**Estado:**  
Pendiente de auditoría de seguridad.

---

### 3.4. Overloads de funciones RPC

**Hallazgo:**  
El catálogo de RPCs detecta funciones con múltiples firmas activas.

**Pendiente:**  
Definir:

- cuáles siguen en uso;
- cuáles son legado;
- cuáles deben consolidarse;
- si existe riesgo de ambigüedad por PostgREST/Supabase.

**Prioridad alta:**  
`filtrar_gastos_admin(...)`

**Estado:**  
Pendiente de saneamiento técnico.

---

### 3.5. Redundancia de políticas RLS

**Hallazgo:**  
`viajes` y `gastos` tienen varias políticas equivalentes o solapadas.

**Pendiente:**  
Consolidar matriz esperada de permisos por rol y operación, y eliminar duplicaciones innecesarias.

**Estado:**  
Pendiente.

---

### 3.6. Contract de salida de `admin_gastos_completos`

**Pregunta técnica:**  
¿Qué columnas son contractuales para frontend y exportaciones, y cuáles podrían refactorizarse?

**Motivo:**  
La vista es punto único de falla para:

- exploración avanzada;
- reportes operativos;
- exportaciones.

**Estado:**  
Pendiente de documentación contractual o tests de regresión.

---

### 3.7. Contrato de JSON de reportes

**RPCs afectadas:**

- `get_reporte_rendicion_completa(...)`
- `get_reporte_caja_completo(...)`

**Pendiente:**  
Documentar shapes de retorno de forma explícita para proteger al generador PDF.

**Estado:**  
Pendiente.

---

## 4. Inconsistencias o decisiones técnicas que requieren seguimiento

### 4.1. Nombres divergentes entre capas

Ejemplo:

- tabla: `gastos.user_id`
- view: alias tipo `gasto_user_id`
- RPC: parámetro tipo `p_responsable_id`

**Riesgo:**  
Mayor carga cognitiva y errores en filtros, joins y exports.

**Estado:**  
Recomendación abierta de estandarización progresiva.

---

### 4.2. Doble FK sobre `gastos.user_id`

**Hallazgo confirmado:**

- FK a `auth.users`
- FK a `perfiles`

**Pregunta técnica:**  
¿Esta duplicidad es una decisión deliberada y necesaria, o puede simplificarse a futuro?

**Estado:**  
Pendiente de revisión arquitectónica.

---

### 4.3. `viajes.user_id` apunta a `auth.users`, no a `perfiles`

**Pregunta:**  
¿Se desea mantener este patrón divergente respecto de otras tablas operativas?

**Estado:**  
Pendiente de decisión técnica.

---

### 4.4. Escritura de `movimientos_caja`

La matriz RLS evidencia lecturas directas, pero no políticas de escritura.

**Pregunta:**  
¿Todas las escrituras se canalizan exclusivamente por RPCs?  
Si es así, conviene documentarlo como regla explícita.

**Estado:**  
Pendiente de formalización.

---

## 5. Roadmap pendiente o parcialmente abierto

| Feature | Estado |
| --- | --- |
| Comparativa entre períodos | Pendiente |
| Alertas de sobrecostos | Pendiente |
| Exportar mapa/gráficos como imagen | Pendiente |
| Geocodificación automática | Pendiente |
| Gestión manual de localidades sin coordenadas | Pendiente |
| Aprobación individual de gastos | Pendiente |
| Dashboard de flota | Pendiente |
| Mantenimiento de vehículos | Pendiente |
| Vista compacta/detallada en historiales | Pendiente |
| Mejoras adicionales de agrupación/ordenamiento | Requiere verificación |

---

## 6. Orden recomendado de resolución

### Prioridad 1 — Seguridad y consistencia

1. Tablas sin RLS.
2. Políticas duplicadas.
3. RPCs sobrecargadas.
4. Inserción de gastos `pendiente_aceptacion`.

### Prioridad 2 — Contratos técnicos

1. `admin_gastos_completos`.
2. Shapes JSON de reportes.
3. Movimientos de caja por RPC.

### Prioridad 3 — Producto

1. Reportes configurables.
2. Reportes operativos.
3. Flota.

---

## 7. Conclusión

Las dudas principales ya no están en la estructura básica del sistema: esa parte quedó documentada.  
Las preguntas abiertas actuales se concentran en:

- seguridad;
- contratos técnicos;
- limpieza de deuda;
- decisiones de negocio finas;
- cierre de módulos parciales.

Este documento debe mantenerse vivo y actualizarse cada vez que una pregunta se resuelva o aparezca un nuevo punto de ambigüedad.
