-- 003_verificacion_posterior.sql
-- Consultas de verificación posterior a la ejecución de 002_cambio_propuesto.sql

-- 1. Confirmar que la RPC existe y su firma acepta p_pagos jsonb
SELECT 
    proname, 
    pg_get_function_arguments(oid) AS argumentos
FROM pg_proc 
WHERE proname = 'crear_pagos_encomiendas_batch';

-- 2. Ejecución de prueba con datos simulados (reemplazar auth.uid() si es necesario en entorno de pruebas)
/*
SELECT public.crear_pagos_encomiendas_batch('[
    {
        "fecha_gasto": "2026-08-01T12:00:00Z",
        "descripcion_general": "TEST BATCH LOGISTICA PTE GOMEZ",
        "monto_total": 1500,
        "cliente_id": 1,
        "transporte_id": 1,
        "proveedor_id": 14,
        "provincia_id": 1,
        "localidad_destino_id": null,
        "numero_guia": "G-TEST-001",
        "paciente_referido": "Gomez Juan",
        "cantidad_bultos": 2,
        "sentido_movimiento": "ida_y_vuelta",
        "tipo_logistica": "cirugia",
        "tipo_movimiento_encomienda": "Envío",
        "destino_texto": "Formosa",
        "observacion_logistica": "Prueba de inserción estructurada"
    }
]'::jsonb);
*/

-- 3. Verificar que el registro recién insertado contiene los datos adicionales correctos
SELECT 
    id, 
    paciente_referido, 
    descripcion_general, 
    monto_total, 
    datos_adicionales
FROM public.gastos
WHERE descripcion_general LIKE 'TEST BATCH LOGISTICA%'
ORDER BY id DESC
LIMIT 1;

-- 4. Verificar que no se rompieron los permisos de ejecución para usuarios autenticados
SELECT 
    grantee, 
    privilege_type 
FROM information_schema.routine_privileges 
WHERE routine_name = 'crear_pagos_encomiendas_batch';
