<!-- src/views/GastoFormView.vue -->
<script setup>
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { supabase } from '../supabaseClient.js';
import GastoForm from '../components/GastoForm.vue';

const router = useRouter();
const route = useRoute();

const loading = ref(true);
const errorMessage = ref('');
const formatosPermitidos = ref([]); 
const formatoSeleccionadoId = ref(null);
const nombreFormatoSeleccionado = ref('');

// --- INICIO DE MI MODIFICACIÓN ---
// Ahora el ID del gasto a editar se obtiene de la ruta de forma estándar
const gastoIdToEdit = ref(route.params.gastoId || null); 
const viajeIdPredeterminadoQuery = ref(route.query.viajeId || null);
const cajaIdPredeterminadaQuery = ref(route.query.caja_id || null); // Añadido para soportar gastos de caja
// --- FIN DE MI MODIFICACIÓN ---

const formatoIdDelGastoAEditar = ref(null);

onMounted(async () => {
  if (gastoIdToEdit.value) {
    // --- MODO EDICIÓN ---
    try {
      const { data: gasto, error: gastoError } = await supabase
        .from('gastos')
        .select('formato_id, formatos_gasto_config(nombre_formato)')
        .eq('id', gastoIdToEdit.value)
        .single();

      if (gastoError) throw gastoError;
      if (!gasto || !gasto.formato_id) throw new Error('No se encontró el gasto o su formato asociado.');

      formatoIdDelGastoAEditar.value = gasto.formato_id;
      nombreFormatoSeleccionado.value = gasto.formatos_gasto_config?.nombre_formato || 'Editar Gasto';

    } catch (e) {
      console.error("Error al obtener datos del gasto a editar:", e);
      errorMessage.value = `No se pudo cargar el gasto para editar: ${e.message}`;
    } finally {
      loading.value = false;
    }
    return;
  }

  // --- MODO CREACIÓN ---
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado.");

    const { data, error } = await supabase
      .from('usuario_formatos_permitidos')
      .select('formatos_gasto_config(id, nombre_formato)')
      .eq('usuario_id', user.id);

    if (error) throw error;

    if (data) {
        formatosPermitidos.value = data
            .map(item => item.formatos_gasto_config)
            .filter(Boolean);
    }

    if (formatosPermitidos.value.length === 1) {
      const formatoUnico = formatosPermitidos.value[0];
      formatoSeleccionadoId.value = formatoUnico.id;
      nombreFormatoSeleccionado.value = formatoUnico.nombre_formato;
    } else if (formatosPermitidos.value.length === 0) {
      errorMessage.value = "No tienes ningún formato de gasto asignado. Contacta a un administrador.";
    }

  } catch (e) {
    console.error("Error al determinar formatos permitidos:", e);
    errorMessage.value = e.message;
  } finally {
    loading.value = false;
  }
});

function seleccionarFormato(formato) {
  formatoSeleccionadoId.value = formato.id;
  nombreFormatoSeleccionado.value = formato.nombre_formato;
}

function handleGastoGuardado(gastoGuardado) {
  // --- INICIO DE MI MODIFICACIÓN: Redirección inteligente ---
  // Reemplazamos el alert por un mensaje en la URL que la otra vista puede mostrar
  const feedbackMessage = gastoIdToEdit.value ? 'Gasto actualizado con éxito.' : 'Gasto creado con éxito.';
  
  if (gastoGuardado?.caja_id) {
    router.push({ name: 'CajaDiaria', query: { feedback: feedbackMessage } });
  } else if (gastoGuardado?.viaje_id) {
    router.push({ name: 'GastosListUser', query: { viajeId: gastoGuardado.viaje_id, feedback: feedbackMessage } });
  } else {
    // Fallback por si no tiene ni caja ni viaje (aunque no debería pasar)
    router.push({ name: 'Dashboard', query: { feedback: feedbackMessage } });
  }
  // --- FIN DE MI MODIFICACIÓN ---
}

function handleCancelar() {
  router.back();
}
</script>

<template>
  <div class="min-h-screen bg-gray-100/50 py-6 sm:py-8 lg:py-12">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">

      <div v-if="loading" class="text-center py-16">
        <svg class="animate-spin h-12 w-12 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <p class="mt-4 text-lg text-gray-600">Cargando...</p>
      </div>

      <div v-else-if="errorMessage" class="bg-white p-8 rounded-xl shadow-lg text-center border border-red-200">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto text-red-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        <p class="text-red-600 font-semibold text-lg">Acceso Denegado o Error</p>
        <p class="text-sm text-gray-500 mt-2">{{ errorMessage }}</p>
        <button @click="router.back()" class="mt-6 px-5 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium">Volver</button>
      </div>

      <div v-else-if="formatosPermitidos.length > 1 && !formatoSeleccionadoId && !gastoIdToEdit">
        <div class="bg-white p-8 rounded-xl shadow-lg text-center">
          <h1 class="text-2xl font-bold text-gray-800 mb-2">Nuevo Gasto</h1>
          <p class="text-gray-600 mb-6">¿Qué tipo de gasto vas a registrar?</p>
          <div class="space-y-4 max-w-sm mx-auto">
            <button v-for="formato in formatosPermitidos" :key="formato.id"
                    @click="seleccionarFormato(formato)"
                    class="w-full text-left p-4 border rounded-lg hover:bg-gray-50 hover:border-indigo-500 transition-all flex items-center justify-between">
              <span class="font-semibold text-gray-800">{{ formato.nombre_formato }}</span>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" /></svg>
            </button>
          </div>
          <button @click="router.back()" class="mt-8 text-sm text-gray-500 hover:underline">Cancelar</button>
        </div>
      </div>

      <div v-else>
        <GastoForm
          :key="gastoIdToEdit || formatoSeleccionadoId"
          :gasto-id="gastoIdToEdit"
          :formato-id="gastoIdToEdit ? formatoIdDelGastoAEditar : formatoSeleccionadoId"
          :nombre-formato="nombreFormatoSeleccionado"
          :viaje-id-predeterminado="viajeIdPredeterminadoQuery"
          :caja-id-predeterminada="cajaIdPredeterminadaQuery"
          @gasto-guardado="handleGastoGuardado"
          @cancelar="handleCancelar"
        />
      </div>

    </div>
  </div>
</template>