# Propuesta Técnica de Cambios en Supabase: Módulo de Logística y Transportes

Este directorio contiene la propuesta técnica completa de actualización para el procedimiento almacenado (RPC) `crear_pagos_encomiendas_batch`.

> [!IMPORTANT]
> **REGLA DE SEGURIDAD Y CONTROL DE CAMBIOS:**
> Ninguno de estos scripts SQL ha sido ejecutado en la base de datos por la IA. Franco debe revisar y ejecutar manualmente estos archivos desde el **Supabase SQL Editor** cuando lo considere oportuno.

---

## 1. Resumen Ejecutivo

- **Objetivo**: Permitir que la función RPC `crear_pagos_encomiendas_batch` reciba e inserte los campos logísticos estructurados (`paciente_referido`, `cantidad_bultos`, `sentido_movimiento`, `tipo_logistica`) tanto en la columna física como en el payload JSONB `datos_adicionales`.
- **Motivo**: Optimizar la carga masiva en planilla sin depender de guardar únicamente textos planos sin estructurar.
- **Objetos afectados**:
  - RPC: `public.crear_pagos_encomiendas_batch(jsonb)`
- **Riesgo**: **Bajo**. La modificación es totalmente aditiva y mantiene compatibilidad con llamadas anteriores que no envíen estos campos.

---

## 2. Orden de Ejecución Manual

1. **`001_inspeccion_previa.sql`**: Ejecutar en el SQL Editor para confirmar que la función existe y revisar registros históricos.
2. **`002_cambio_propuesto.sql`**: Ejecutar para aplicar la actualización de la RPC.
3. **`003_verificacion_posterior.sql`**: Ejecutar para confirmar la firma y probar una inserción simulada.
4. **`004_rollback.sql`**: (Solo en caso de necesitar restaurar la versión anterior de la RPC).

---

## 3. Compatibilidad con el Frontend

El código del frontend se desarrolló con **compatibilidad progresiva (fallback nativo)**:
- Mientras **NO** se haya ejecutado el script SQL `002_cambio_propuesto.sql`, el frontend continuará guardando los nuevos campos estructurados dentro del JSONB `datos_adicionales` de cada registro, por lo que el sistema seguirá operando al 100% sin romperse.
- Una vez que Franco confirme la aplicación de `002_cambio_propuesto.sql`, la carga masiva aprovechará el desempaquetado nativo en la base de datos.
