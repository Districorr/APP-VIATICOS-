-- 004_rollback.sql
-- Instrucciones y script de reversión (Rollback) para restaurar crear_pagos_encomiendas_batch a su estado anterior.

-- ATENCIÓN: Antes de ejecutar 002_cambio_propuesto.sql en producción, exporte la definición previa de la función ejecutando:
-- SELECT pg_get_functiondef('public.crear_pagos_encomiendas_batch(jsonb)'::regprocedure);

-- A continuación se incluye la versión estándar previa de restauración:
CREATE OR REPLACE FUNCTION public.crear_pagos_encomiendas_batch(p_pagos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item jsonb;
    v_user_id uuid;
    v_inserted_ids bigint[] := ARRAY[]::bigint[];
    v_inserted_id bigint;
    v_count integer := 0;
    v_errors jsonb := '[]'::jsonb;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'mensaje', 'Usuario no autenticado.');
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_pagos)
    LOOP
        BEGIN
            INSERT INTO public.gastos (
                user_id, creado_por_id, formato_id, origen_gasto, estado_delegacion,
                fecha_gasto, descripcion_general, monto_total, cliente_id, transporte_id,
                proveedor_id, provincia_id, localidad_destino_id, numero_factura, datos_adicionales
            ) VALUES (
                v_user_id, v_user_id, 1, 'cuenta_corriente_empresa', 'directo',
                (v_item->>'fecha_gasto')::timestamptz, v_item->>'descripcion_general', (v_item->>'monto_total')::numeric,
                (v_item->>'cliente_id')::bigint, (v_item->>'transporte_id')::bigint, (v_item->>'proveedor_id')::bigint,
                (v_item->>'provincia_id')::bigint, (v_item->>'localidad_destino_id')::bigint, v_item->>'numero_guia',
                jsonb_build_object(
                    'origen_carga', 'encomiendas_carga_multiple',
                    'destino_texto', v_item->>'destino_texto',
                    'tipo_movimiento_encomienda', v_item->>'tipo_movimiento_encomienda',
                    'observacion_logistica', v_item->>'observacion_logistica'
                )
            ) RETURNING id INTO v_inserted_id;

            v_inserted_ids := array_append(v_inserted_ids, v_inserted_id);
            v_count := v_count + 1;
        EXCEPTION WHEN OTHERS THEN
            v_errors := v_errors || jsonb_build_object('item', v_item, 'error', SQLERRM);
        END;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'count', v_count, 'ids', to_jsonb(v_inserted_ids), 'errores', v_errors);
END;
$$;
