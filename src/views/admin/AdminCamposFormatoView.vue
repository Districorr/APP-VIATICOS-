<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { supabase } from '../../supabaseClient.js'; // Ajusta la ruta
import CampoConfigForm from '../../components/admin/CampoConfigForm.vue'; // Importamos el formulario

const route = useRoute();
const router = useRouter();
const formatoId = ref(parseInt(route.params.formatoId));
const nombreFormato = ref('');
const camposConfigurados = ref([]);
const loading = ref(true);
const errorMessage = ref('');

const mostrarFormularioCampo = ref(false);
const campoAEditar = ref(null);
const esModoEdicionCampo = ref(false);

const fetchFormatoInfoYCampos = async () => {
  loading.value = true;
  errorMessage.value = '';
  try {
    const { data: formatoData, error: formatoError } = await supabase
      .from('formatos_gasto_config')
      .select('nombre_formato')
      .eq('id', formatoId.value)
      .single();
    if (formatoError) throw formatoError;
    if (formatoData) nombreFormato.value = formatoData.nombre_formato;

    const { data: camposData, error: camposError } = await supabase
      .from('campos_formato_config')
      .select('*')
      .eq('formato_id', formatoId.value)
      .order('orden_visualizacion', { ascending: true });
    if (camposError) throw camposError;
    camposConfigurados.value = camposData;

  } catch (error) {
    console.error('Error cargando datos del formato y campos:', error.message);
    errorMessage.value = 'No se pudieron cargar los datos: ' + error.message;
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchFormatoInfoYCampos();
});

const abrirFormularioParaCrearCampo = () => {
  campoAEditar.value = null;
  esModoEdicionCampo.value = false;
  mostrarFormularioCampo.value = true;
};

const abrirFormularioParaEditarCampo = (campo) => {
  campoAEditar.value = { ...campo };
  esModoEdicionCampo.value = true;
  mostrarFormularioCampo.value = true;
};

const cerrarFormularioCampo = () => {
  mostrarFormularioCampo.value = false;
  campoAEditar.value = null;
};

const handleCampoGuardado = (campoGuardado) => {
  fetchFormatoInfoYCampos();
  if (!esModoEdicionCampo.value) {
     setTimeout(() => {
        cerrarFormularioCampo();
     }, 1500);
  }
};

const eliminarCampoConfig = async (campoId) => {
    if (!confirm('¿Estás seguro de que querés eliminar este campo del formato?')) return;
    try {
        const { error } = await supabase
            .from('campos_formato_config')
            .delete()
            .eq('id', campoId);
        if (error) throw error;
        fetchFormatoInfoYCampos();
        alert('Campo eliminado del formato.');
    } catch (error) {
        console.error('Error eliminando campo:', error.message);
        alert('Error al eliminar el campo: ' + error.message);
    }
};

const volverAFormatos = () => {
  router.push({ name: 'AdminFormatosGasto' });
};
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <div class="mb-6">
      <button @click="volverAFormatos" class="text-districorr-accent hover:underline font-medium inline-flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 mr-1">
          <path fill-rule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clip-rule="evenodd" />
        </svg>
        Volver a Gestionar Formatos
      </button>
    </div>
    <div class="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
      <h1 class="text-2xl sm:text-3xl font-bold text-districorr-primary text-center sm:text-left">
        Configurar Campos para: <span class="text-districorr-accent">{{ nombreFormato || `Formato ID ${formatoId}` }}</span>
      </h1>
      <button
        @click="abrirFormularioParaCrearCampo"
        class="w-full sm:w-auto bg-green-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-green-600 transition duration-150 ease-in-out shadow-md flex items-center justify-center"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 mr-2"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
        Nuevo Campo
      </button>
    </div>

    <!-- Aquí se usa el componente CampoConfigForm -->
    <div v-if="mostrarFormularioCampo" class="mb-8">
      <CampoConfigForm
        :key="campoAEditar ? `edit-${campoAEditar.id}` : `new-${formatoId}`"
        :formato-id="formatoId"
        :campo-a-editar="campoAEditar"
        :is-edit-mode="esModoEdicionCampo"
        @guardado="handleCampoGuardado"
        @cancelar="cerrarFormularioCampo"
      />
    </div>

    <div v-if="loading" class="text-center py-10">
        <svg class="animate-spin h-8 w-8 text-districorr-primary mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="mt-2 text-gray-600">Cargando campos...</p>
    </div>
    <div v-else-if="errorMessage" class="bg-red-100 border-l-4 border-districorr-error text-districorr-error p-4 rounded-md" role="alert">
      <p class="font-bold">Error</p>
      <p>{{ errorMessage }}</p>
    </div>
    <div v-else-if="camposConfigurados.length === 0 && !mostrarFormularioCampo" class="bg-white p-6 rounded-lg shadow-md text-center">
      <p class="text-gray-600">Este formato aún no tiene campos definidos.</p>
       <button
        @click="abrirFormularioParaCrearCampo"
        class="mt-4 bg-green-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-green-600 transition duration-150 ease-in-out shadow-md"
      >
        Añadir Primer Campo
      </button>
    </div>

    <div v-else-if="camposConfigurados.length > 0" class="bg-white shadow-xl rounded-lg overflow-hidden">
      <h3 class="text-lg font-medium text-districorr-text-dark p-4 border-b">Campos Definidos para "{{nombreFormato}}"</h3>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Orden</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Etiqueta Visible</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre Técnico</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Obligatorio</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Opciones (Selector)</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="campo in camposConfigurados" :key="campo.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{{ campo.orden_visualizacion }}</td>
              <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-districorr-text-dark">{{ campo.etiqueta_visible }}</td>
              <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500 font-mono">{{ campo.nombre_campo_tecnico }}</td>
              <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{{ campo.tipo_dato }}</td>
              <td class="px-4 py-3 whitespace-nowrap text-sm text-center">
                <span :class="campo.es_obligatorio ? 'text-green-600 font-semibold' : 'text-red-500'">{{ campo.es_obligatorio ? 'Sí' : 'No' }}</span>
              </td>
              <td class="px-4 py-3 text-sm text-gray-500 max-w-xs truncate" :title="campo.opciones_selector ? JSON.stringify(campo.opciones_selector) : ''">
                {{ campo.opciones_selector ? (Array.isArray(campo.opciones_selector) ? campo.opciones_selector.join(', ') : campo.opciones_selector) : '-' }}
              </td>
              <td class="px-4 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                <button @click="abrirFormularioParaEditarCampo(campo)" class="text-districorr-accent hover:text-blue-700">Editar</button>
                <button @click="eliminarCampoConfig(campo.id)" class="text-red-600 hover:text-red-800">Eliminar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Estilos específicos si fueran necesarios */
</style>