# Spec de Feature: Gastos a Cuenta Corriente de la Empresa

- ID: F-LOG-001
- Estado: Implementada en frontend
- Fecha de implementacion: 2026-05-13
- Alcance implementado: frontend de `GastoForm.vue`

## 1. Objetivo

Permitir que un usuario registre gastos operativos imputados a cuenta corriente de la empresa, sin asociarlos a una rendicion, una caja diaria, una delegacion ni un vehiculo.

## 2. Alcance

### Dentro del alcance

- Agregar una cuarta opcion en el Paso 1 de `GastoForm.vue`: `A Cuenta Corriente de la Empresa`.
- Mantener la integracion visual con las opciones existentes del formulario.
- Permitir avanzar al Paso 2 sin seleccionar rendicion, caja diaria ni usuario receptor.
- Guardar el gasto en la tabla existente `gastos`.
- Enviar el payload con:
  - `origen_gasto: 'cuenta_corriente_empresa'`
  - `estado_delegacion: 'directo'`
  - `viaje_id: null`
  - `caja_id: null`
  - `vehiculo_id: null`

### Fuera del alcance

- Crear tablas.
- Crear columnas.
- Modificar backend, SQL, RPCs, triggers o views.
- Modificar dashboards, analytics o reportes.
- Cambiar los flujos existentes de rendicion, caja diaria o delegacion.

## 3. Comportamiento frontend

Al seleccionar `A Cuenta Corriente de la Empresa`:

- no se muestra selector de rendicion;
- no se muestra selector de caja diaria;
- no se muestra selector de usuario receptor de delegacion;
- se limpia cualquier seleccion previa de `viaje_id`, `caja_id`, `delegatedToUserId` y `vehiculo_id`;
- se oculta la opcion de agregar vehiculo como campo opcional;
- se puede continuar al Paso 2 normalmente.

## 4. Persistencia esperada

El gasto se persiste en `gastos` mediante el flujo frontend existente de alta/edicion. No se invoca la RPC de caja diaria y no se usa la RPC de delegacion.

| Campo | Valor esperado |
| --- | --- |
| `origen_gasto` | `'cuenta_corriente_empresa'` |
| `estado_delegacion` | `'directo'` |
| `viaje_id` | `null` |
| `caja_id` | `null` |
| `vehiculo_id` | `null` |

## 5. Criterios de aceptacion

- El usuario puede seleccionar `A Cuenta Corriente de la Empresa`.
- El formulario permite avanzar al Paso 2 sin seleccionar origen operativo adicional.
- El gasto se guarda sin rendicion, caja diaria ni delegacion.
- No se descuenta saldo de caja.
- No se asocia vehiculo.
- No se modifican backend ni SQL.
- Los flujos existentes de rendicion, caja diaria y delegacion siguen operando con sus validaciones previas.

## 6. Validacion tecnica

- Build frontend ejecutado correctamente con `npm.cmd run build`.
- La tabla `gastos` ya admite registros sin `viaje_id`, `caja_id` ni `vehiculo_id`.
- Este caso se diferencia de delegaciones pendientes/rechazadas por `estado_delegacion = 'directo'` y `origen_gasto = 'cuenta_corriente_empresa'`.
