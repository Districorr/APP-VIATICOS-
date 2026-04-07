<script setup>
import { ref, onMounted, computed } from 'vue';
import { supabase } from '../../supabaseClient.js';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const formatoId = computed(() => parseInt(route.params.formatoId)); // Asume que el ID del formato viene como param
const formatoInfo = ref(null);
const todosTiposGasto = ref([]);
const tiposGastoAsignados = ref(new Set()); // Usamos un Set para fácil chequeo y evitar duplicados
const loading = ref(true);
const errorMessage = ref('');
const successMessage = ref('');

const fetchData = async () => {
  loading.value = true;
  errorMessage.value = '';
  try {
    // Cargar info del formato
    const { data: formatoData, error: formatoError } = await supabase
      .from('formatos_gasto_config')
      .select('id, nombre_formato')
      .eq('id', formatoId.value)
      .single();
    if (formatoError) throw formatoError;
    formatoInfo.value = formatoData;

    // Cargar todos los tipos de gasto activos
    const { data: tiposData, error: tiposError } = await supabase
      .from('tipos_gasto_config')
      .select('id, nombre_tipo_gasto')
      .eq('activo', true)
      .order('nombre_tipo_gasto');
    if (tiposError) throw tiposError;
    todosTiposGasto.value = tiposData;

    // Cargar los tipos de gasto ya asignados a este formato
    const { data: asignadosData, error: asignadosError } = await supabase
      .from('seccion_tipos_gasto_permitidos') // Nombre de tu tabla de unión
      .select('tipo_gasto_id')
      .eq('seccion_id', formatoId.value); // 'seccion_id' es el FK a formatos_gasto_config
    if (asignadosError) throw asignadosError;
    tiposGastoAsignados.value = new Set(asignadosData.map(item => item.tipo_gasto_id));

  } catch (error) {
    console.error("Error cargando datos:", error.message);
    errorMessage.value = "Error al cargar datos: " + error.message;
  } finally {
    loading.value = false;
  }
};

onMounted(fetchData);

const toggleTipoGasto = async (tipoGastoId) => {
  successMessage.value = '';
  errorMessage.value = '';
  const yaAsignado = tiposGastoAsignados.value.has(tipoGastoId);

  try {
    if (yaAsignado) {
      // Eliminar de la tabla de unión
      const { error } = await supabase
        .from('seccion_tipos_gasto_permitidos')
        .delete()
        .match({ seccion_id: formatoId.value, tipo_gasto_id: tipoGastoId });
      if (error) throw error;
      tiposGastoAsignados.value.delete(tipoGastoId);
      successMessage.value = "Tipo de gasto desasignado.";
    } else {
      // Insertar en la tabla de unión
      const { error } = await supabase
        .from('seccion_tipos_gasto_permitidos')
        .insert({ seccion_id: formatoId.value, tipo_gasto_id: tipoGastoId });
      if (error) throw error;
      tiposGastoAsignados.value.add(tipoGastoId);
      successMessage.value = "Tipo de gasto asignado.";
    }
  } catch (error) {
    console.error("Error actualizando asignación:", error.message);
    errorMessage.value = "Error al actualizar: " + error.message;
    // Revertir el cambio en el Set si la operación de BD falla
    if (yaAsignado) tiposGastoAsignados.value.add(tipoGastoId);
    else tiposGastoAsignados.value.delete(tipoGastoId);
  }
};
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <button @click="router.push({ name: 'AdminFormatosGasto' })" class="mb-6 text-districorr-accent hover:underline">
      ← Volver a Formatos de Gasto
    </button>

    <div v-if="loading" class="text-center py-10">Cargando...</div>
    <div v-else-if="errorMessage" class="bg-red-100 border-l-4 border-districorr-error text-districorr-error p-4 rounded-md mb-6" role="alert">
      <p class="font-bold">Error</p>
      <p>{{ errorMessage }}</p>
    </div>
    <div v-else-if="formatoInfo">
      <h1 class="text-2xl sm:text-3xl font-bold text-districorr-primary mb-2">
        Tipos de Gasto para: <span class="text-districorr-accent">{{ formatoInfo.nombre_formato }}</span>
      </h1>
      <p class="text-districorr-text-medium mb-6">Selecciona los tipos de gasto que estarán disponibles para este formato.</p>

      <div v-if="successMessage" class="mb-4 p-3 bg-green-100 border border-districorr-success text-districorr-success rounded-md text-sm">
        {{ successMessage }}
      </div>

      <div class="bg-white p-6 rounded-xl shadow-lg">
        <div v-if="todosTiposGasto.length === 0" class="text-gray-500">
          No hay tipos de gasto globales definidos o activos. Ve a "Gestionar Tipos de Gasto Globales" para añadirlos.
        </div>
        <ul v-else class="space-y-3">
          <li v-for="tipo in todosTiposGasto" :key="tipo.id"
              class="flex items-center justify-between p-3 border rounded-md hover:bg-gray-50">
            <span class="text-districorr-text-dark">{{ tipo.nombre_tipo_gasto }}</span>
            <button
              @click="toggleTipoGasto(tipo.id)"
              :class="tiposGastoAsignados.has(tipo.id) ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'"
              class="text-white text-xs font-semibold py-1 px-3 rounded-full transition-colors"
            >
              {{ tiposGastoAsignados.has(tipo.id) ? 'Desasignar' : 'Asignar' }}
            </button>
          </li>
        </ul>
      </div>
    </div>
    <div v-else class="text-center py-10 text-gray-600">
      Formato no encontrado.
    </div>
  </div>
</template>

<style scoped></style>