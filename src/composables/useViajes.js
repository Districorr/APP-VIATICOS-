// src/composables/useViajes.js
import { ref } from 'vue';
import { supabase } from '../supabaseClient.js';

export function useViajes() {
  const loadingCierre = ref(false);
  const errorCierre = ref(null);

  const loadingFondos = ref(false);
  const errorFondos = ref(null);

  const cerrarRendicion = async (viajeId, fechaFinEfectiva, observacion) => {
    loadingCierre.value = true;
    errorCierre.value = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado.");

      const updates = {
        cerrado_en: new Date().toISOString(), // Momento del cierre
        fecha_fin: fechaFinEfectiva,          // Fecha de fin que el usuario podría haber especificado
        observacion_cierre: observacion || null,
      };
      const { data: updatedViaje, error } = await supabase
        .from('viajes')
        .update(updates)
        .eq('id', viajeId)
        .eq('user_id', user.id) // Doble seguridad
        .select('*, codigo_rendicion, cerrado_en, observacion_cierre') // Traer todos los datos
        .single();
      if (error) throw error;
      return updatedViaje;
    } catch (err) {
      errorCierre.value = err.message;
      console.error("Error en composable useViajes - cerrarRendicion:", err);
      throw err; // Re-lanzar para que el componente lo maneje
    } finally {
      loadingCierre.value = false;
    }
  };

  const agregarFondosARendicion = async (viajeId, montoAdicional, observacion = '') => {
    loadingFondos.value = true;
    errorFondos.value = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado.");

      const numericMonto = parseFloat(montoAdicional);
      if (isNaN(numericMonto) || numericMonto <= 0) {
        throw new Error("El monto a adicionar debe ser un número mayor a 0.");
      }

      // Obtener la rendición actual
      const { data: viaje, error: fetchErr } = await supabase
        .from('viajes')
        .select('id, monto_adelanto, comentarios_aprobacion')
        .eq('id', viajeId)
        .single();

      if (fetchErr || !viaje) throw new Error("No se pudo obtener la rendición: " + (fetchErr?.message || 'No encontrada'));

      const nuevoMonto = (parseFloat(viaje.monto_adelanto) || 0) + numericMonto;
      const updates = { monto_adelanto: nuevoMonto };

      const fechaHora = new Date().toLocaleString('es-AR');
      const motivoTexto = observacion && observacion.trim() ? observacion.trim() : 'Recarga adicional de adelanto';
      const notaNueva = `[${fechaHora}] Recarga de Fondos: +$${numericMonto.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - ${motivoTexto}`;

      updates.comentarios_aprobacion = viaje.comentarios_aprobacion 
        ? `${viaje.comentarios_aprobacion}\n${notaNueva}`
        : notaNueva;

      const { data: updatedViaje, error: updateErr } = await supabase
        .from('viajes')
        .update(updates)
        .eq('id', viajeId)
        .select()
        .single();

      if (updateErr) throw updateErr;

      // Registrar también el movimiento en la tabla gastos como ingreso de fondos
      try {
        await supabase
          .from('gastos')
          .insert([{
            user_id: user.id,
            creado_por_id: user.id,
            viaje_id: viajeId,
            formato_id: 1,
            fecha_gasto: new Date().toISOString(),
            descripcion_general: `Ingreso de Fondos: ${motivoTexto}`,
            monto_total: numericMonto,
            monto_iva: 0,
            moneda: 'ARS',
            datos_adicionales: {
              es_ingreso_fondos: true,
              tipo_registro: 'ingreso_fondos',
              observacion_recarga: motivoTexto
            }
          }]);
      } catch (gastoErr) {
        console.warn("No se pudo registrar el ingreso en la tabla gastos (continuando):", gastoErr);
      }

      return updatedViaje;
    } catch (err) {
      errorFondos.value = err.message;
      console.error("Error en useViajes - agregarFondosARendicion:", err);
      throw err;
    } finally {
      loadingFondos.value = false;
    }
  };

  return { cerrarRendicion, loadingCierre, errorCierre, agregarFondosARendicion, loadingFondos, errorFondos };
}