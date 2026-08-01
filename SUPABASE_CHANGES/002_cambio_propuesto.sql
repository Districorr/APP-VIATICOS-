-- 002_cambio_propuesto.sql
-- Propuesta de actualización no destructiva para la RPC crear_pagos_encomiendas_batch.
-- NO EJECUTAR AUTOMÁTICAMENTE: Franco debe revisar este archivo y aplicarlo manualmente en Supabase SQL Editor.

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
    v_datos_adicionales jsonb;
BEGIN
    -- Obtener el usuario autenticado actual
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'ok', false,
            'mensaje', 'Usuario no autenticado en Supabase.',
            'count', 0,
            'ids', '[]'::jsonb
        );
    END IF;

    -- Validar que el parámetro p_pagos sea un array no vacío
    IF p_pagos IS NULL OR jsonb_array_length(p_pagos) = 0 THEN
        RETURN jsonb_build_object(
            'ok', false,
            'mensaje', 'El listado p_pagos está vacío.',
            'count', 0,
            'ids', '[]'::jsonb
        );
    END IF;

    -- Iterar sobre cada elemento del array JSON
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_pagos)
    LOOP
        BEGIN
            -- Construir el objeto JSONB datos_adicionales unificando los campos logísticos
            v_datos_adicionales := jsonb_build_object(
                'origen_carga', COALESCE(v_item->>'origen_carga', 'encomiendas_carga_multiple'),
                'modulo', 'logistica',
                'tipo_logistica', COALESCE(v_item->>'tipo_logistica', 'cirugia'),
                'tipo_movimiento_encomienda', v_item->>'tipo_movimiento_encomienda',
                'cantidad_bultos', COALESCE((v_item->>'cantidad_bultos')::integer, 1),
                'sentido_movimiento', COALESCE(v_item->>'sentido_movimiento', 'ida'),
                'destino_texto', v_item->>'destino_texto',
                'observacion_logistica', COALESCE(v_item->>'observacion_logistica', v_item->>'observacion'),
                'encomienda_id', v_item->>'encomienda_id'
            );

            -- Insertar el registro en public.gastos respetando el estándar F-LOG-001
            INSERT INTO public.gastos (
                user_id,
                creado_por_id,
                formato_id,
                tipo_gasto_id,
                origen_gasto,
                estado_delegacion,
                fecha_gasto,
                descripcion_general,
                monto_total,
                cliente_id,
                transporte_id,
                proveedor_id,
                provincia_id,
                localidad_destino_id,
                numero_factura,
                paciente_referido,
                datos_adicionales
            ) VALUES (
                v_user_id,
                v_user_id,
                1, -- Formato Logística
                COALESCE((v_item->>'tipo_gasto_id')::bigint, 22), -- Fallback dinámico a 22
                'cuenta_corriente_empresa',
                'directo',
                (v_item->>'fecha_gasto')::timestamptz,
                v_item->>'descripcion_general',
                (v_item->>'monto_total')::numeric,
                (v_item->>'cliente_id')::bigint,
                (v_item->>'transporte_id')::bigint,
                (v_item->>'proveedor_id')::bigint,
                (v_item->>'provincia_id')::bigint,
                (v_item->>'localidad_destino_id')::bigint,
                v_item->>'numero_guia',
                v_item->>'paciente_referido',
                v_datos_adicionales
            )
            RETURNING id INTO v_inserted_id;

            v_inserted_ids := array_append(v_inserted_ids, v_inserted_id);
            v_count := v_count + 1;

        EXCEPTION WHEN OTHERS THEN
            v_errors := v_errors || jsonb_build_object(
                'item', v_item,
                'error', SQLERRM
            );
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'ok', (v_count > 0),
        'count', v_count,
        'ids', to_jsonb(v_inserted_ids),
        'errores', v_errors
    );
END;
$$;

-- Otorgar permisos de ejecución a los roles autenticados
GRANT EXECUTE ON FUNCTION public.crear_pagos_encomiendas_batch(jsonb) TO authenticated;
