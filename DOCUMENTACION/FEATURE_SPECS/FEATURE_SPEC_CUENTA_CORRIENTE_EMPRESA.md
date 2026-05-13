\# Spec de Feature: Gastos a Cuenta Corriente de la Empresa



\- ID: F-LOG-001

\- Estado: Aprobada para diseño técnico

\- Fecha: 2026-05-12



\## 1. Objetivo



Permitir que un usuario registre gastos operativos que no son abonados por él ni por caja diaria, sino imputados a cuenta corriente de Districorr, sin sacarlos del flujo actual de carga de gastos.



El caso inicial de uso es el registro de encomiendas/logística de cajas con proveedores como SAI, SWIPRO, BIOPROTECE, VERACRUZ y OLYMPIA.



\---



\## 2. Alcance



\### Dentro del alcance



\- Agregar una cuarta opción en el Paso 1 del formulario de gasto:

&#x20; - A Cuenta Corriente de la Empresa.

\- Guardar el gasto en la tabla `gastos`.

\- Para esta opción:

&#x20; - `viaje\_id = NULL`

&#x20; - `caja\_id = NULL`

&#x20; - `vehiculo\_id = NULL`

&#x20; - `estado\_delegacion = 'directo'`

&#x20; - `user\_id = auth.uid()`

&#x20; - `creado\_por\_id = auth.uid()`

&#x20; - `origen\_gasto = 'cuenta\_corriente\_empresa'`

\- Mantener compatibilidad con el tipo de gasto `Envíos | Proveedores`.

\- Usar:

&#x20; - `transporte\_id` para operador logístico.

&#x20; - `proveedor\_id` para empresa vinculada.

&#x20; - `paciente\_referido` como dato opcional.

&#x20; - `datos\_adicionales.tipo\_movimiento\_encomienda`

&#x20; - `datos\_adicionales.numero\_guia`



\### Fuera del alcance



\- Cupo mensual.

\- Dashboard específico de encomiendas.

\- Alertas de exceso de cupo.

\- Conciliación posterior contra facturas de EMAPACK / TRANSPACK.

\- Modificación de KPIs globales actuales.



\---



\## 3. Regla de negocio



Un gasto imputado a cuenta corriente de la empresa:



\- representa un costo operativo generado;

\- no integra la rendición del responsable;

\- no descuenta caja chica;

\- queda registrado para futura analítica y control de costos.



\---



\## 4. Impacto backend



\### Tabla `gastos`



No se requiere nueva tabla.



Se utilizará el campo existente:



\- `origen\_gasto = 'cuenta\_corriente\_empresa'`



\### Validación esperada



Al insertar un gasto con `origen\_gasto = 'cuenta\_corriente\_empresa'`:



\- no debe tener `viaje\_id`;

\- no debe tener `caja\_id`;

\- no debe tener `vehiculo\_id`.



\### Compatibilidad con constraint existente



El constraint de exclusividad de origen ya permite cero o un origen, por lo que el caso es compatible.



\---



\## 5. Impacto frontend



\- Modificar el Paso 1 de `GastoForm.vue`.

\- Agregar la opción visual:

&#x20; - “A Cuenta Corriente de la Empresa”.

\- Al seleccionar esa opción:

&#x20; - no solicitar viaje;

&#x20; - no solicitar caja;

&#x20; - no solicitar receptor de delegación.

\- El submit debe enviar:

&#x20; - `origen\_gasto: 'cuenta\_corriente\_empresa'`

&#x20; - IDs de origen en `NULL`.



\---



\## 6. Criterios de aceptación



\- El usuario puede seleccionar “A Cuenta Corriente de la Empresa”.

\- El gasto se guarda correctamente.

\- No queda asociado a rendición.

\- No modifica saldo de caja.

\- No entra en reportes de rendición.

\- Sigue siendo visible para administración.

\- Puede usarse con el tipo de gasto `Envíos | Proveedores`.

\- Permite registrar operador logístico, empresa vinculada, tipo de movimiento y guía/remito.



\---



\## 7. Punto de verificación técnica previo



Antes de implementar, verificar si `gastos.origen\_gasto` ya posee valores utilizados con otra semántica en producción.

