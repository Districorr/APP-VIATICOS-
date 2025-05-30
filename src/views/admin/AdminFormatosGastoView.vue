<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '../../supabaseClient.js'; // Ajusta la ruta
import FormatoGastoForm from '../../components/admin/FormatoGastoForm.vue'; // Ajusta la ruta
import { useRouter } from 'vue-router';

const router = useRouter();
const formatos = ref([]);
const loading = ref(true);
const errorMessage = ref('');

const mostrarFormulario = ref(false);
const formatoSeleccionado = ref(null);
const esModoEdicion = ref(false);

const fetchFormatos = async () => {
  loading.value = true;
  errorMessage.value = '';
  try {
    const { data, error } = await supabase
      .from('formatos_gasto_config')
      .select('*')
      .order('nombre_formato', { ascending: true });
    if (error) throw error;
    formatos.value = data;
  } catch (error) {
    console.error('Error cargando formatos de gasto:', error.message);
    errorMessage.value = 'No se pudieron cargar los formatos de gasto.';
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchFormatos();
});

const abrirFormularioParaCrear = () => {
  formatoSeleccionado.value = null;
  esModoEdicion.value = false;
  mostrarFormulario.value = true;
};

const abrirFormularioParaEditar = (formato) => {
  formatoSeleccionado.value = { ...formato };
  esModoEdicion.value = true;
  mostrarFormulario.value = true;
};

const cerrarFormulario = () => {
  mostrarFormulario.value = false;
  formatoSeleccionado.value = null;
};

const handleGuardado = (formatoGuardado) => {
  fetchFormatos(); // Recargar la lista
  // No cerramos el formulario automáticamente en edición, sí en creación
  if (!esModoEdicion.value) {
    setTimeout(() => {
        cerrarFormulario();
    }, 1500); // Dar tiempo para ver mensaje de éxito
  }
};

const eliminarFormato = async (id) => {
  if (!confirm('¿Estás seguro de que querés eliminar este formato de gasto? Se desvinculará de los usuarios y campos asociados.')) {
    return;
  }
  try {
    // Considerar qué pasa con los campos_formato_config y usuario_formatos_permitidos (ON DELETE CASCADE ayuda)
    const { error } = await supabase
      .from('formatos_gasto_config')
      .delete()
      .eq('id', id);
    if (error) throw error;
    fetchFormatos();
    alert('Formato de gasto eliminado.');
  } catch (error) {
    console.error('Error eliminando formato:', error.message);
    alert('Error al eliminar: ' + error.message);
  }
};

const configurarCampos = (formatoId) => {
  router.push({ name: 'AdminCamposFormato', params: { formatoId: formatoId } });
};

const asignarUsuarios = (formatoId) => {
  router.push({ name: 'AdminAsignarFormatoUsuarios', params: { formatoId: formatoId } }); // Correcto
}

</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <div class="mb-6">
      <router-link :to="{ name: 'Dashboard' }" class="text-districorr-accent hover:underline">
        ← Volver al Panel Principal
      </router-link>
       <span class="mx-2 text-gray-400">|</span>
      <router-link :to="{ name: 'AdminTiposGastoGlobales' }" class="text-districorr-accent hover:underline">
        Gestionar Tipos de Gasto Globales
      </router-link>
    </div>

    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold text-districorr-primary">Gestionar Formatos de Gasto</h1>
      <button
        @click="abrirFormularioParaCrear"
        class="bg-districorr-accent text-white font-semibold py-2 px-4 rounded-md hover:bg-opacity-80 transition duration-150 ease-in-out shadow-md"
      >
        + Nuevo Formato
      </button>
    </div>

    <div v-if="mostrarFormulario" class="mb-8 p-4 bg-gray-50 rounded-lg shadow">
      <FormatoGastoForm
        :key="formatoSeleccionado ? formatoSeleccionado.id : 'nuevo-formato'"
        :formatoAEditar="formatoSeleccionado"
        :isEditMode="esModoEdicion"
        @guardado="handleGuardado"
        @cancelar="cerrarFormulario"
      />
    </div>

    <div v-if="loading" class="text-center py-10">Cargando formatos...</div>
    <div v-else-if="errorMessage" class="bg-red-100 border-l-4 border-districorr-error text-districorr-error p-4 rounded-md" role="alert">
      <p class="font-bold">Error</p>
      <p>{{ errorMessage }}</p>
    </div>
    <div v-else-if="formatos.length === 0 && !mostrarFormulario" class="bg-white p-6 rounded-lg shadow-md text-center">
      <p class="text-gray-600">No hay formatos de gasto configurados. ¡Crea el primero!</p>
    </div>

    <div v-else-if="formatos.length > 0" class="bg-white shadow-xl rounded-lg overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre Formato</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activo</th>
            <th scope="col" class="relative px-6 py-3"><span class="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="formato in formatos" :key="formato.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-districorr-text-dark">{{ formato.nombre_formato }}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 truncate max-w-md" :title="formato.descripcion">{{ formato.descripcion || '-' }}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">
              <span :class="formato.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'" class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full">
                {{ formato.activo ? 'Sí' : 'No' }}
              </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
              <button @click="configurarCampos(formato.id)" class="text-indigo-600 hover:text-indigo-900">Campos</button>
              <button @click="asignarUsuarios(formato.id)" class="text-purple-600 hover:text-purple-900">Asignar</button>
              <button @click="abrirFormularioParaEditar(formato)" class="text-districorr-accent hover:text-blue-700">Editar</button>
              <button @click="eliminarFormato(formato.id)" class="text-red-600 hover:text-red-800">Eliminar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped></style>