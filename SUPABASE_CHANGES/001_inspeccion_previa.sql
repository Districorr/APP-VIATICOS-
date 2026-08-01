-- 001_inspeccion_previa.sql
-- Consultas de solo lectura para inspeccionar el estado actual antes de aplicar cambios a crear_pagos_encomiendas_batch

-- 1. Verificar la firma y definición actual de la RPC crear_pagos_encomiendas_batch
SELECT 
    p.proname AS nombre_rpc,
    pg_get_function_arguments(p.oid) AS argumentos_entrada,
    pg_get_functiondef(p.oid) AS definicion_completa
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'crear_pagos_encomiendas_batch';

-- 2. Inspeccionar la estructura física actual de la tabla public.gastos
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'gastos'
ORDER BY ordinal_position;

-- 3. Consultar los últimos 10 registros creados por carga múltiple de encomiendas
SELECT 
    id, 
    fecha_gasto, 
    monto_total, 
    cliente_id, 
    proveedor_id, 
    transporte_id, 
    provincia_id, 
    localidad_destino_id, 
    numero_guia, 
    descripcion_general, 
    datos_adicionales
FROM public.gastos
WHERE datos_adicionales->>'origen_carga' = 'encomiendas_carga_multiple'
ORDER BY id DESC
LIMIT 10;

-- 4. Contar la cantidad de registros de encomiendas existentes
SELECT 
    COUNT(*) AS total_registros_encomiendas
FROM public.gastos
WHERE datos_adicionales->>'origen_carga' = 'encomiendas_carga_multiple' 
   OR tipo_gasto_id = 22;
