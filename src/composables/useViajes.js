// src/composables/useViajes.js
import { ref } from 'vue';
import { supabase } from '../supabaseClient.js';
import { store } from '../store.js'; // Si tuvieras un store simple para el user_id

export function useViajes() {
  const loadingCierre = ref(false);
  const errorCierre = ref(null);

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
  return { cerrarRendicion, loadingCierre, errorCierre };
}