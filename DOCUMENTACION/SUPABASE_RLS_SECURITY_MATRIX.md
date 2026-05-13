# SUPABASE_RLS_SECURITY_MATRIX.md

## Matriz de Row Level Security — InfoGastos Districorr

**Versión:** 1.0  
**Fecha de consolidación:** 2026-05-12  
**Fuente:** export real de políticas RLS y estado de RLS por tabla desde Supabase.

---

## 1. Alcance

Este documento consolida la **matriz real de Row Level Security (RLS)** de las tablas del esquema `public` de InfoGastos.

Incluye:

- estado RLS por tabla;
- si RLS está forzado;
- cantidad de políticas por tabla;
- políticas completas con `USING` y `WITH CHECK`;
- lectura ejecutiva de patrones, duplicaciones y puntos sensibles.

> **Límite de auditoría:** este documento no analiza `GRANT/REVOKE`, exposición efectiva por Data API, ni seguridad de vistas. Esos puntos deben revisarse de forma complementaria cuando se haga una auditoría de exposición completa.

---

## 2. Resumen cuantitativo

| Métrica | Valor |
| --- | ---: |
| Tablas públicas auditadas | 26 |
| Tablas con RLS habilitado | 14 |
| Tablas sin RLS habilitado | 12 |
| Tablas con RLS forzado | 1 |
| Políticas RLS detectadas | 75 |
| Tablas con políticas | 14 |
| Políticas `ALL` | 15 |
| Políticas `SELECT` | 27 |
| Políticas `INSERT` | 9 |
| Políticas `UPDATE` | 12 |
| Políticas `DELETE` | 12 |

---

## 3. Estado RLS por tabla

| Tabla | RLS habilitado | RLS forzado | Políticas | Lectura rápida |
| --- | --- | --- | ---: | --- |
| `bancos` | No | No | 0 | RLS deshabilitado. |
| `cajas_chicas` | Sí | No | 2 | RLS habilitado. |
| `campos_formato_config` | Sí | No | 4 | RLS habilitado. |
| `clientes` | Sí | No | 7 | RLS habilitado. |
| `formatos_gasto_config` | Sí | No | 4 | RLS habilitado. |
| `gastos` | Sí | No | 14 | RLS habilitado. |
| `grupos_gastos` | No | No | 0 | RLS deshabilitado. |
| `historial_aprobaciones_rendicion` | No | No | 0 | RLS deshabilitado. |
| `historial_delegaciones` | Sí | No | 2 | RLS habilitado. |
| `localidades` | No | No | 0 | RLS deshabilitado. |
| `movimientos_caja` | Sí | No | 2 | RLS habilitado. |
| `notificaciones` | Sí | No | 4 | RLS habilitado. |
| `perfiles` | Sí | Sí | 5 | RLS habilitado y forzado. |
| `proveedores` | Sí | No | 3 | RLS habilitado. |
| `provincias` | No | No | 0 | RLS deshabilitado. |
| `registros_combustible` | No | No | 0 | RLS deshabilitado. |
| `reporte_rendicion_config` | No | No | 0 | RLS deshabilitado. |
| `solicitudes_eliminacion` | No | No | 0 | RLS deshabilitado. |
| `solicitudes_reposicion` | No | No | 0 | RLS deshabilitado. |
| `tipos_gasto_config` | Sí | No | 4 | RLS habilitado. |
| `transportes` | Sí | No | 3 | RLS habilitado. |
| `usuario_formatos_permitidos` | Sí | No | 5 | RLS habilitado. |
| `usuario_tipos_gasto_permitidos` | No | No | 0 | RLS deshabilitado. |
| `vehiculo_asignaciones` | No | No | 0 | RLS deshabilitado. |
| `vehiculos` | No | No | 0 | RLS deshabilitado. |
| `viajes` | Sí | No | 17 | RLS habilitado. |

---

## 4. Tablas sin RLS habilitado

Las siguientes tablas del esquema `public` aparecen **sin RLS habilitado** en el export auditado:

- `bancos`
- `grupos_gastos`
- `historial_aprobaciones_rendicion`
- `localidades`
- `provincias`
- `registros_combustible`
- `reporte_rendicion_config`
- `solicitudes_eliminacion`
- `solicitudes_reposicion`
- `usuario_tipos_gasto_permitidos`
- `vehiculo_asignaciones`
- `vehiculos`

### Lectura técnica

- La ausencia de RLS no demuestra por sí sola una exposición indebida, pero sí obliga a revisar de forma consciente los **grants**, el uso directo desde frontend y la exposición de la tabla a APIs.
- Entre estas tablas hay objetos operativos o sensibles, por ejemplo: `historial_aprobaciones_rendicion`, `registros_combustible`, `reporte_rendicion_config`, `solicitudes_eliminacion`, `solicitudes_reposicion`, `vehiculos` y `vehiculo_asignaciones`.
- Este conjunto debe entrar en una revisión de seguridad separada para decidir si cada tabla:
  1. debe habilitar RLS;
  2. debe permanecer sin RLS pero fuera de exposición directa;
  3. debe migrarse a un esquema privado o quedar protegida solo mediante RPCs.

---

## 5. Tablas con RLS habilitado y patrón de acceso

| Tabla | Lectura del patrón de seguridad |
| --- | --- |
| `cajas_chicas` | Admin: acceso total. Responsable: lectura de su caja. |
| `campos_formato_config` | Lectura abierta a autenticados; administración completa para admins. Se observan políticas administrativas duplicadas. |
| `clientes` | Lectura amplia a autenticados y gestión propia por `user_id`; hay superposición entre políticas específicas y `ALL` propio. |
| `formatos_gasto_config` | Lectura de formatos a autenticados; administración completa para admins. Existen políticas de lectura y CRUD duplicadas. |
| `gastos` | Matriz compleja: admins gestionan todo; usuarios operan sobre gastos propios y sobre gastos de viajes propios abiertos. Hay múltiples políticas equivalentes o solapadas. |
| `historial_delegaciones` | Lectura e inserción ligadas al `receptor_id = auth.uid()`. |
| `movimientos_caja` | Solo lectura: admin ve todo; responsable ve movimientos de sus cajas. No hay políticas directas de escritura. |
| `notificaciones` | CRUD parcial propio: leer, crear, marcar leída y borrar notificaciones propias; insert también admite admins. |
| `perfiles` | RLS habilitado y forzado. Lectura amplia a autenticados; actualización del propio perfil o por admins; admins pueden crear perfiles. |
| `proveedores` | Lectura a autenticados y control total para admins. Hay duplicidad de políticas SELECT equivalentes. |
| `tipos_gasto_config` | Lectura a autenticados y administración por admins. Existen políticas equivalentes con funciones de rol distintas. |
| `transportes` | Lectura para autenticados y administración por admins. |
| `usuario_formatos_permitidos` | Usuarios ven sus formatos; admins administran asignaciones. Hay duplicación entre políticas admin. |
| `viajes` | Admins gestionan todo; usuarios crean, ven, actualizan y eliminan viajes propios, con reglas adicionales para viajes abiertos. Hay redundancias importantes. |

---

## 6. Hallazgos de auditoría

### 6.1. `perfiles` es la única tabla con RLS forzado

- `perfiles` tiene `rls_enabled = true` y `rls_forced = true`.
- Esto obliga a que incluso el owner de la tabla respete RLS, salvo roles con privilegios especiales.

### 6.2. Redundancia de políticas en `viajes` y `gastos`

- `viajes` acumula múltiples políticas casi equivalentes para `SELECT`, `INSERT`, `UPDATE` y `DELETE`.
- `gastos` presenta varias políticas repetidas o muy similares en español e inglés para actualización y eliminación en viajes abiertos.
- Esta redundancia no implica por sí misma un fallo, pero incrementa el costo de mantenimiento y el riesgo de que una regla vieja permanezca activa cuando el negocio cambia.

### 6.3. Revisión recomendada para `gastos` — INSERT de delegaciones

La política **`Permitir INSERT de gastos (Final)`** permite insertar cuando:

```sql
((estado_delegacion = 'directo' AND user_id = auth.uid())
 OR estado_delegacion = 'pendiente_aceptacion')
```

Esto significa que el caso `pendiente_aceptacion` no exige en esa política que `user_id = auth.uid()`. Puede ser intencional por el flujo de delegación, pero conviene validarlo contra la lógica RPC/frontend para confirmar que no abre un camino más amplio del necesario.

### 6.4. `movimientos_caja` no permite escritura directa por políticas RLS

- Se detectan políticas `SELECT`, pero no `INSERT`, `UPDATE` ni `DELETE`.
- Esto es coherente con un diseño donde los movimientos se generan mediante RPCs o lógica backend controlada.

### 6.5. Lecturas amplias en catálogos/configuraciones

- `campos_formato_config`, `formatos_gasto_config`, `proveedores`, `tipos_gasto_config` y `transportes` contienen políticas `SELECT` para usuarios autenticados.
- En varios casos, la lectura es `true` o equivalente a lectura general del catálogo.
- Debe considerarse comportamiento esperado si estos objetos son catálogos comunes de la aplicación.

### 6.6. Tablas operativas sin RLS que merecen revisión prioritaria

- `historial_aprobaciones_rendicion`
- `registros_combustible`
- `reporte_rendicion_config`
- `solicitudes_eliminacion`
- `solicitudes_reposicion`
- `vehiculo_asignaciones`
- `vehiculos`

Estas tablas no tienen RLS habilitado en el export. La decisión de mantenerlas así debe estar documentada o revisarse junto con grants y rutas de acceso.

---

## 7. Matriz completa de políticas RLS

| Tabla | Política | Tipo | Roles | Permissive | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- | --- |
| `cajas_chicas` | Permitir acceso total a administradores | `ALL` | `{public}` | `PERMISSIVE` | (( SELECT perfiles.rol<br>   FROM perfiles<br>  WHERE (perfiles.id = auth.uid())) = 'admin'::text) | — |
| `cajas_chicas` | Permitir lectura al responsable de la caja | `SELECT` | `{public}` | `PERMISSIVE` | (auth.uid() = responsable_id) | — |
| `campos_formato_config` | Permitir CRUD de campos_formato a admins | `ALL` | `{authenticated}` | `PERMISSIVE` | (( SELECT perfiles.rol<br>   FROM perfiles<br>  WHERE (perfiles.id = auth.uid())) = 'admin'::text) | (( SELECT perfiles.rol<br>   FROM perfiles<br>  WHERE (perfiles.id = auth.uid())) = 'admin'::text) |
| `campos_formato_config` | Permitir manejo completo de campos_formato_config a admins | `ALL` | `{authenticated}` | `PERMISSIVE` | (( SELECT perfiles.rol<br>   FROM perfiles<br>  WHERE (perfiles.id = auth.uid())) = 'admin'::text) | (( SELECT perfiles.rol<br>   FROM perfiles<br>  WHERE (perfiles.id = auth.uid())) = 'admin'::text) |
| `campos_formato_config` | Permitir SELECT de campos_formato_config a autenticados | `SELECT` | `{authenticated}` | `PERMISSIVE` | true | — |
| `campos_formato_config` | Permitir lectura de campos_formato a autenticados | `SELECT` | `{authenticated}` | `PERMISSIVE` | true | — |
| `clientes` | Usuarios pueden gestionar sus propios clientes referidos. | `ALL` | `{public}` | `PERMISSIVE` | (auth.uid() = user_id) | (auth.uid() = user_id) |
| `clientes` | Usuarios pueden borrar sus propios clientes referidos | `DELETE` | `{public}` | `PERMISSIVE` | (auth.uid() = user_id) | — |
| `clientes` | Permitir inserción a usuarios autenticados | `INSERT` | `{authenticated}` | `PERMISSIVE` | — | true |
| `clientes` | Usuarios pueden crear clientes referidos para si mismos | `INSERT` | `{public}` | `PERMISSIVE` | — | (auth.uid() = user_id) |
| `clientes` | Permitir lectura a usuarios autenticados | `SELECT` | `{authenticated}` | `PERMISSIVE` | true | — |
| `clientes` | Usuarios pueden leer sus propios clientes referidos | `SELECT` | `{public}` | `PERMISSIVE` | (auth.uid() = user_id) | — |
| `clientes` | Usuarios pueden actualizar sus propios clientes referidos | `UPDATE` | `{public}` | `PERMISSIVE` | (auth.uid() = user_id) | (auth.uid() = user_id) |
| `formatos_gasto_config` | Permitir CRUD de formatos a admins | `ALL` | `{authenticated}` | `PERMISSIVE` | (( SELECT perfiles.rol<br>   FROM perfiles<br>  WHERE (perfiles.id = auth.uid())) = 'admin'::text) | (( SELECT perfiles.rol<br>   FROM perfiles<br>  WHERE (perfiles.id = auth.uid())) = 'admin'::text) |
| `formatos_gasto_config` | Permitir manejo completo de formatos_gasto_config a admins | `ALL` | `{authenticated}` | `PERMISSIVE` | (( SELECT perfiles.rol<br>   FROM perfiles<br>  WHERE (perfiles.id = auth.uid())) = 'admin'::text) | (( SELECT perfiles.rol<br>   FROM perfiles<br>  WHERE (perfiles.id = auth.uid())) = 'admin'::text) |
| `formatos_gasto_config` | Permitir SELECT de formatos_gasto_config a autenticados | `SELECT` | `{authenticated}` | `PERMISSIVE` | true | — |
| `formatos_gasto_config` | Permitir lectura de formatos a autenticados | `SELECT` | `{authenticated}` | `PERMISSIVE` | (activo = true) | — |
| `gastos` | Admins pueden gestionar todos los gastos. | `ALL` | `{public}` | `PERMISSIVE` | (get_my_role() = 'admin'::text) | (get_my_role() = 'admin'::text) |
| `gastos` | Permitir DELETE de gastos propios | `DELETE` | `{authenticated}` | `PERMISSIVE` | (auth.uid() = user_id) | — |
| `gastos` | RLS: Gastos - Delete en viaje propio y abierto | `DELETE` | `{public}` | `PERMISSIVE` | ((auth.uid() = user_id) AND (EXISTS ( SELECT 1<br>   FROM viajes v<br>  WHERE ((v.id = gastos.viaje_id) AND (v.user_id = auth.uid()) AND (v.cerrado_en IS NULL))))) | — |
| `gastos` | Users can delete expenses on their own open trips. | `DELETE` | `{public}` | `PERMISSIVE` | ((auth.uid() = user_id) AND (EXISTS ( SELECT 1<br>   FROM viajes v<br>  WHERE ((v.id = gastos.viaje_id) AND (v.user_id = auth.uid()) AND (v.cerrado_en IS NULL))))) | — |
| `gastos` | Usuarios pueden eliminar sus propios gastos en viajes abiertos. | `DELETE` | `{public}` | `PERMISSIVE` | ((auth.uid() = user_id) AND (EXISTS ( SELECT 1<br>   FROM viajes v<br>  WHERE ((v.id = gastos.viaje_id) AND (v.user_id = auth.uid()) AND (v.cerrado_en IS NULL))))) | — |
| `gastos` | Permitir INSERT de gastos (Final) | `INSERT` | `{authenticated}` | `PERMISSIVE` | — | (((estado_delegacion = 'directo'::text) AND (user_id = auth.uid())) OR (estado_delegacion = 'pendiente_aceptacion'::text)) |
| `gastos` | Admins pueden ver TODOS los gastos | `SELECT` | `{authenticated}` | `PERMISSIVE` | (get_my_role() = 'admin'::text) | — |
| `gastos` | Permitir SELECT de gastos propios | `SELECT` | `{authenticated}` | `PERMISSIVE` | (auth.uid() = user_id) | — |
| `gastos` | RLS: Gastos - Select en viaje propio o si admin | `SELECT` | `{public}` | `PERMISSIVE` | ((EXISTS ( SELECT 1<br>   FROM viajes v<br>  WHERE ((v.id = gastos.viaje_id) AND (v.user_id = auth.uid())))) OR (get_my_role() = 'admin'::text)) | — |
| `gastos` | Usuarios pueden ver gastos de sus propios viajes. | `SELECT` | `{public}` | `PERMISSIVE` | (auth.uid() = user_id) | — |
| `gastos` | Permitir UPDATE de gastos propios | `UPDATE` | `{authenticated}` | `PERMISSIVE` | (auth.uid() = user_id) | (auth.uid() = user_id) |
| `gastos` | RLS: Gastos - Update en viaje propio y abierto | `UPDATE` | `{public}` | `PERMISSIVE` | ((auth.uid() = user_id) AND (EXISTS ( SELECT 1<br>   FROM viajes v<br>  WHERE ((v.id = gastos.viaje_id) AND (v.user_id = auth.uid()) AND (v.cerrado_en IS NULL))))) | ((auth.uid() = user_id) AND (EXISTS ( SELECT 1<br>   FROM viajes v<br>  WHERE ((v.id = gastos.viaje_id) AND (v.user_id = auth.uid()) AND (v.cerrado_en IS NULL))))) |
| `gastos` | Users can update expenses on their own open trips. | `UPDATE` | `{public}` | `PERMISSIVE` | ((auth.uid() = user_id) AND (EXISTS ( SELECT 1<br>   FROM viajes v<br>  WHERE ((v.id = gastos.viaje_id) AND (v.user_id = auth.uid()) AND (v.cerrado_en IS NULL))))) | ((auth.uid() = user_id) AND (EXISTS ( SELECT 1<br>   FROM viajes v<br>  WHERE ((v.id = gastos.viaje_id) AND (v.user_id = auth.uid()) AND (v.cerrado_en IS NULL))))) |
| `gastos` | Usuarios pueden actualizar sus propios gastos en viajes abierto | `UPDATE` | `{public}` | `PERMISSIVE` | ((auth.uid() = user_id) AND (EXISTS ( SELECT 1<br>   FROM viajes v<br>  WHERE ((v.id = gastos.viaje_id) AND (v.user_id = auth.uid()) AND (v.cerrado_en IS NULL))))) | ((auth.uid() = user_id) AND (EXISTS ( SELECT 1<br>   FROM viajes v<br>  WHERE ((v.id = gastos.viaje_id) AND (v.user_id = auth.uid()) AND (v.cerrado_en IS NULL))))) |
| `historial_delegaciones` | Permitir inserción en el historial | `INSERT` | `{authenticated}` | `PERMISSIVE` | — | (receptor_id = auth.uid()) |
| `historial_delegaciones` | Permitir lectura del historial propio | `SELECT` | `{authenticated}` | `PERMISSIVE` | (receptor_id = auth.uid()) | — |
| `movimientos_caja` | Permitir lectura de movimientos al responsable | `SELECT` | `{public}` | `PERMISSIVE` | (caja_id IN ( SELECT cajas_chicas.id<br>   FROM cajas_chicas<br>  WHERE (cajas_chicas.responsable_id = auth.uid()))) | — |
| `movimientos_caja` | Permitir lectura total a administradores | `SELECT` | `{public}` | `PERMISSIVE` | (( SELECT perfiles.rol<br>   FROM perfiles<br>  WHERE (perfiles.id = auth.uid())) = 'admin'::text) | — |
| `notificaciones` | Los usuarios pueden borrar sus propias notificaciones | `DELETE` | `{public}` | `PERMISSIVE` | (auth.uid() = user_id) | — |
| `notificaciones` | Los usuarios pueden crear notificaciones para sí mismos y los  | `INSERT` | `{public}` | `PERMISSIVE` | — | ((auth.uid() = user_id) OR (( SELECT perfiles.rol<br>   FROM perfiles<br>  WHERE (perfiles.id = auth.uid())) = 'admin'::text)) |
| `notificaciones` | Los usuarios pueden ver sus propias notificaciones | `SELECT` | `{public}` | `PERMISSIVE` | (auth.uid() = user_id) | — |
| `notificaciones` | Los usuarios pueden marcar como leídas sus propias notificacio | `UPDATE` | `{public}` | `PERMISSIVE` | (auth.uid() = user_id) | (auth.uid() = user_id) |
| `perfiles` | Los admins pueden crear perfiles | `INSERT` | `{public}` | `PERMISSIVE` | — | (( SELECT perfiles_1.rol<br>   FROM perfiles perfiles_1<br>  WHERE (perfiles_1.id = auth.uid())) = 'admin'::text) |
| `perfiles` | Permitir lectura de perfiles a usuarios autenticados | `SELECT` | `{authenticated}` | `PERMISSIVE` | true | — |
| `perfiles` | RLS: Admins pueden ver todos los perfiles | `SELECT` | `{authenticated}` | `PERMISSIVE` | (get_user_role() = 'admin'::text) | — |
| `perfiles` | RLS: Usuarios pueden ver su propio perfil | `SELECT` | `{authenticated}` | `PERMISSIVE` | (auth.uid() = id) | — |
| `perfiles` | Usuarios pueden actualizar su perfil y Admins cualquiera | `UPDATE` | `{public}` | `PERMISSIVE` | ((auth.uid() = id) OR (( SELECT perfiles_1.rol<br>   FROM perfiles perfiles_1<br>  WHERE (perfiles_1.id = auth.uid())) = 'admin'::text)) | ((auth.uid() = id) OR (( SELECT perfiles_1.rol<br>   FROM perfiles perfiles_1<br>  WHERE (perfiles_1.id = auth.uid())) = 'admin'::text)) |
| `proveedores` | Permitir control total a los administradores sobre proveedores | `ALL` | `{authenticated}` | `PERMISSIVE` | (( SELECT perfiles.rol<br>   FROM perfiles<br>  WHERE (perfiles.id = auth.uid())) = 'admin'::text) | (( SELECT perfiles.rol<br>   FROM perfiles<br>  WHERE (perfiles.id = auth.uid())) = 'admin'::text) |
| `proveedores` | Permitir lectura a usuarios autenticados | `SELECT` | `{authenticated}` | `PERMISSIVE` | true | — |
| `proveedores` | Permitir lectura de proveedores a todos los usuarios autenticad | `SELECT` | `{authenticated}` | `PERMISSIVE` | true | — |
| `tipos_gasto_config` | Admins pueden gestionar configuraciones. | `ALL` | `{public}` | `PERMISSIVE` | (get_my_role() = 'admin'::text) | (get_my_role() = 'admin'::text) |
| `tipos_gasto_config` | Permitir CRUD a admins en tipos_gasto_config | `ALL` | `{authenticated}` | `PERMISSIVE` | (( SELECT perfiles.rol<br>   FROM perfiles<br>  WHERE (perfiles.id = auth.uid())) = 'admin'::text) | (( SELECT perfiles.rol<br>   FROM perfiles<br>  WHERE (perfiles.id = auth.uid())) = 'admin'::text) |
| `tipos_gasto_config` | Permitir lectura a autenticados en tipos_gasto_config | `SELECT` | `{authenticated}` | `PERMISSIVE` | (activo = true) | — |
| `tipos_gasto_config` | Usuarios autenticados pueden leer configuraciones. | `SELECT` | `{public}` | `PERMISSIVE` | (auth.role() = 'authenticated'::text) | — |
| `transportes` | Los administradores pueden gestionar los transportes | `ALL` | `{public}` | `PERMISSIVE` | (get_user_role() = 'admin'::text) | — |
| `transportes` | Los usuarios autenticados pueden ver los transportes | `SELECT` | `{public}` | `PERMISSIVE` | (auth.role() = 'authenticated'::text) | — |
| `transportes` | Permitir lectura a usuarios autenticados | `SELECT` | `{authenticated}` | `PERMISSIVE` | true | — |
| `usuario_formatos_permitidos` | Los administradores pueden gestionar todas las asignaciones | `ALL` | `{public}` | `PERMISSIVE` | (get_user_role() = 'admin'::text) | — |
| `usuario_formatos_permitidos` | Permitir INSERT DELETE de formatos permitidos a admins | `ALL` | `{authenticated}` | `PERMISSIVE` | (( SELECT perfiles.rol<br>   FROM perfiles<br>  WHERE (perfiles.id = auth.uid())) = 'admin'::text) | (( SELECT perfiles.rol<br>   FROM perfiles<br>  WHERE (perfiles.id = auth.uid())) = 'admin'::text) |
| `usuario_formatos_permitidos` | Permitir SELECT de todos los formatos permitidos a admins | `SELECT` | `{authenticated}` | `PERMISSIVE` | (( SELECT perfiles.rol<br>   FROM perfiles<br>  WHERE (perfiles.id = auth.uid())) = 'admin'::text) | — |
| `usuario_formatos_permitidos` | Permitir SELECT de formatos permitidos propios | `SELECT` | `{authenticated}` | `PERMISSIVE` | (auth.uid() = usuario_id) | — |
| `usuario_formatos_permitidos` | Los usuarios pueden ver sus formatos permitidos | `SELECT` | `{public}` | `PERMISSIVE` | (auth.uid() = usuario_id) | — |
| `viajes` | Admins pueden gestionar todos los viajes. | `ALL` | `{public}` | `PERMISSIVE` | (get_my_role() = 'admin'::text) | (get_my_role() = 'admin'::text) |
| `viajes` | Permitir DELETE de viajes propios | `DELETE` | `{authenticated}` | `PERMISSIVE` | (auth.uid() = user_id) | — |
| `viajes` | RLS: Viajes - Delete propio si abierto | `DELETE` | `{public}` | `PERMISSIVE` | ((auth.uid() = user_id) AND (cerrado_en IS NULL)) | — |
| `viajes` | Users can delete their own open trips. | `DELETE` | `{public}` | `PERMISSIVE` | ((auth.uid() = user_id) AND (cerrado_en IS NULL)) | — |
| `viajes` | Usuarios pueden eliminar sus propios viajes abiertos. | `DELETE` | `{public}` | `PERMISSIVE` | ((auth.uid() = user_id) AND (cerrado_en IS NULL)) | — |
| `viajes` | Permitir INSERT de viajes propios | `INSERT` | `{authenticated}` | `PERMISSIVE` | — | (auth.uid() = user_id) |
| `viajes` | RLS: Viajes - Insert propio | `INSERT` | `{public}` | `PERMISSIVE` | — | (auth.uid() = user_id) |
| `viajes` | Usuarios pueden crear nuevos viajes para si mismos. | `INSERT` | `{public}` | `PERMISSIVE` | — | (auth.uid() = user_id) |
| `viajes` | Permitir SELECT de viajes propios | `SELECT` | `{authenticated}` | `PERMISSIVE` | (auth.uid() = user_id) | — |
| `viajes` | RLS: Viajes - Select propio o si admin | `SELECT` | `{public}` | `PERMISSIVE` | ((auth.uid() = user_id) OR (get_my_role() = 'admin'::text)) | — |
| `viajes` | Usuarios pueden ver sus propios viajes. | `SELECT` | `{public}` | `PERMISSIVE` | (auth.uid() = user_id) | — |
| `viajes` | Permitir UPDATE de viajes propios | `UPDATE` | `{authenticated}` | `PERMISSIVE` | (auth.uid() = user_id) | (auth.uid() = user_id) |
| `viajes` | RLS: Viajes - Update propio si abierto | `UPDATE` | `{public}` | `PERMISSIVE` | ((auth.uid() = user_id) AND (cerrado_en IS NULL)) | ((auth.uid() = user_id) AND (cerrado_en IS NULL) AND (user_id = ( SELECT v.user_id<br>   FROM viajes v<br>  WHERE (v.id = viajes.id)))) |
| `viajes` | Users can update their own open trips. | `UPDATE` | `{public}` | `PERMISSIVE` | ((auth.uid() = user_id) AND (cerrado_en IS NULL)) | ((auth.uid() = user_id) AND (cerrado_en IS NULL)) |
| `viajes` | Usuarios pueden actualizar sus propios viajes abiertos. | `UPDATE` | `{public}` | `PERMISSIVE` | ((auth.uid() = user_id) AND (cerrado_en IS NULL)) | ((auth.uid() = user_id) AND (cerrado_en IS NULL)) |
| `viajes` | Usuarios pueden cerrar sus propios viajes (actualizar cerrado_e | `UPDATE` | `{public}` | `PERMISSIVE` | ((auth.uid() = user_id) AND (cerrado_en IS NULL)) | (auth.uid() = user_id) |

---

## 8. Matriz resumida por operación

| Tabla | SELECT | INSERT | UPDATE | DELETE | ALL |
| --- | ---: | ---: | ---: | ---: | ---: |
| `cajas_chicas` | 1 | 0 | 0 | 0 | 1 |
| `campos_formato_config` | 2 | 0 | 0 | 0 | 2 |
| `clientes` | 2 | 2 | 1 | 1 | 1 |
| `formatos_gasto_config` | 2 | 0 | 0 | 0 | 2 |
| `gastos` | 4 | 1 | 4 | 4 | 1 |
| `historial_delegaciones` | 1 | 1 | 0 | 0 | 0 |
| `movimientos_caja` | 2 | 0 | 0 | 0 | 0 |
| `notificaciones` | 1 | 1 | 1 | 1 | 0 |
| `perfiles` | 3 | 1 | 1 | 0 | 0 |
| `proveedores` | 2 | 0 | 0 | 0 | 1 |
| `tipos_gasto_config` | 2 | 0 | 0 | 0 | 2 |
| `transportes` | 2 | 0 | 0 | 0 | 1 |
| `usuario_formatos_permitidos` | 3 | 0 | 0 | 0 | 2 |
| `viajes` | 3 | 3 | 5 | 4 | 1 |

---

## 9. Puntos de control para futuras features

Antes de modificar una tabla o diseñar una feature nueva, revisar:

1. Si la tabla tiene RLS habilitado.
2. Si existe una política específica para la operación requerida.
3. Si la lógica ya se resuelve mediante RPC y, por lo tanto, no debe exponerse con acceso directo.
4. Si la feature toca `gastos`, `viajes`, `perfiles`, `cajas_chicas`, `usuario_formatos_permitidos` o `notificaciones`, revisar las políticas existentes antes de crear nuevas.
5. Si se crea una tabla nueva en `public`, documentar expresamente su estrategia de RLS.

---

## 10. Conclusión

La matriz RLS de InfoGastos está activa en los módulos principales de interacción directa (`gastos`, `viajes`, `perfiles`, catálogos configurables, caja chica y notificaciones). Sin embargo, el esquema contiene un grupo relevante de tablas sin RLS habilitado, así como varias políticas redundantes en `viajes`, `gastos`, configuraciones y pivotes de permisos.

Este documento debe tratarse como la **fuente de verdad actual de políticas RLS**, pero no sustituye una auditoría complementaria de:

- grants por rol;
- exposición por Data API;
- `security_invoker` / `security_definer` en vistas;
- funciones `SECURITY DEFINER` que puedan operar por fuera de RLS.
