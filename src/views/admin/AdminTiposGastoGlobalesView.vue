<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '../../supabaseClient.js';
import TipoGastoForm from '../../components/admin/TipoGastoForm.vue'; // El que creamos en el Paso 2.1

const tiposGastoGlobales = ref([]);
const loading = ref(true);
const errorMessage = ref('');

const mostrarFormulario = ref(false);
const tipoGastoSeleccionado = ref(null);
const esModoEdicion = ref(false);

const fetchTiposGastoGlobales = async () => {
  loading.value = true;
  errorMessage.value = '';
  try {
    const { data, error } = await supabase
      .from('tipos_gasto_config') // Nombre de tu tabla maestra de tipos de gasto
      .select('*')
      .order('nombre_tipo_gasto', { ascending: true });
    if (error) throw error;
    tiposGastoGlobales.value = data;
  } catch (error) {
    console.error('Error cargando tipos de gasto globales:', error.message);
    errorMessage.value = 'No se pudieron cargar los tipos de gasto globales.';
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchTiposGastoGlobales();
});

const abrirFormularioParaCrear = () => {
  tipoGastoSeleccionado.value = null;
  esModoEdicion.value = false;
  mostrarFormulario.value = true;
};

const abrirFormularioParaEditar = (tipoGasto) => {
  tipoGastoSeleccionado.value = { ...tipoGasto };
  esModoEdicion.value = true;
  mostrarFormulario.value = true;
};

const cerrarFormulario = () => {
  mostrarFormulario.value = false;
  tipoGastoSeleccionado.value = null;
};

const handleGuardado = () => {
  fetchTiposGastoGlobales();
  // Opcional: cerrar el formulario
  // if (!esModoEdicion.value) cerrarFormulario();
};

const eliminarTipoGasto = async (id) => {
  if (!confirm('¿Estás seguro de que querés eliminar este tipo de gasto global? Si está en uso en algún formato, podría causar problemas.')) {
    return;
  }
  try {
    const { error } = await supabase
      .from('tipos_gasto_config')
      .delete()
      .eq('id', id);
    if (error) throw error;
    fetchTiposGastoGlobales();
    alert('Tipo de gasto global eliminado.');
  } catch (error) {
    console.error('Error eliminando tipo de gasto global:', error.message);
    alert('Error al eliminar: ' + error.message);
  }
};
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <div class="flex justify-between items-center mb-8">
      <h1 class="text-3xl font-bold text-districorr-primary">Gestionar Tipos de Gasto (Globales)</h1>
      <button
        @click="abrirFormularioParaCrear"
        class="btn btn-accent"
      >
        + Nuevo Tipo Global
      </button>
    </div>

    <div v-if="mostrarFormulario" class="mb-8 p-6 bg-gray-50 rounded-lg shadow">
      <TipoGastoForm
        :key="tipoGastoSeleccionado ? tipoGastoSeleccionado.id : 'nuevo-tipo-global'"
        :tipoGastoAEditar="tipoGastoSeleccionado"
        :isEditMode="esModoEdicion"
        @guardado="handleGuardado"
        @cancelar="cerrarFormulario"
      />
    </div>

    <div v-if="loading" class="text-center py-10">Cargando tipos de gasto...</div>
    <div v-else-if="errorMessage" class="bg-red-100 border-l-4 border-districorr-error text-districorr-error p-4 rounded-md" role="alert">
      <p class="font-bold">Error</p>
      <p>{{ errorMessage }}</p>
    </div>
    <div v-else-if="tiposGastoGlobales.length === 0 && !mostrarFormulario" class="bg-white p-6 rounded-lg shadow-md text-center">
      <p class="text-gray-600">No hay tipos de gasto globales configurados.</p>
    </div>

    <div v-else-if="tiposGastoGlobales.length > 0" class="bg-white shadow-xl rounded-lg overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activo</th>
            <th scope="col" class="relative px-6 py-3"><span class="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="tipo in tiposGastoGlobales" :key="tipo.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-districorr-text-dark">{{ tipo.nombre_tipo_gasto }}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 truncate max-w-xs" :title="tipo.descripcion">{{ tipo.descripcion || '-' }}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">
              <span :class="tipo.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'" class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full">
                {{ tipo.activo ? 'Sí' : 'No' }}
              </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
              <button @click="abrirFormularioParaEditar(tipo)" class="text-districorr-accent hover:text-blue-700">Editar</button>
              <button @click="eliminarTipoGasto(tipo.id)" class="text-red-600 hover:text-red-800">Eliminar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped></style>