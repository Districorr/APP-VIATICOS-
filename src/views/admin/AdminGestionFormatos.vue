<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '../../supabaseClient.js';
import FormatoGastoForm from '../../components/admin/FormatoGastoForm.vue';

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
      .select(`
        *,
        campos_formato_config(count),
        usuario_formatos_permitidos(count)
      `)
      .order('nombre_formato', { ascending: true });

    if (error) throw error;
    
    formatos.value = data.map(formato => ({
      ...formato,
      campos_count: formato.campos_formato_config[0]?.count || 0,
      usuarios_count: formato.usuario_formatos_permitidos[0]?.count || 0,
    }));

  } catch (error) {
    console.error('Error cargando formatos de gasto:', error.message);
    errorMessage.value = 'No se pudieron cargar los formatos de gasto.';
  } finally {
    loading.value = false;
  }
};

onMounted(fetchFormatos);

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

const handleGuardado = () => {
  fetchFormatos();
  if (!esModoEdicion.value) {
    setTimeout(() => {
        cerrarFormulario();
    }, 1500);
  }
};

const eliminarFormato = async (id) => {
  if (!confirm('¿Estás seguro de que querés eliminar este formato?')) return;
  try {
    const { error } = await supabase.from('formatos_gasto_config').delete().eq('id', id);
    if (error) throw error;
    fetchFormatos();
    alert('Formato eliminado.');
  } catch (error) {
    alert('Error al eliminar: ' + error.message);
  }
};

const configurarCampos = (formatoId) => {
  router.push({ name: 'AdminCamposFormato', params: { formatoId } });
};

const asignarUsuarios = (formatoId) => {
  router.push({ name: 'AdminAsignarUsuariosFormato', params: { formatoId } });
};
</script>
<template>
  <div class="container mx-auto px-4 py-8">
    <div class="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
      <h1 class="text-2xl sm:text-3xl font-bold text-gray-800 text-center sm:text-left">Gestionar Formatos de Gasto</h1>
      <button @click="abrirFormularioParaCrear" class="btn-action-primary w-full sm:w-auto">
        + Nuevo Formato
      </button>
    </div>

    <div v-if="mostrarFormulario" class="mb-8 p-4 bg-gray-50 rounded-lg shadow-inner border">
      <FormatoGastoForm
        :key="formatoSeleccionado ? formatoSeleccionado.id : 'nuevo-formato'"
        :formatoAEditar="formatoSeleccionado"
        :isEditMode="esModoEdicion"
        @guardado="handleGuardado"
        @cancelar="cerrarFormulario"
      />
    </div>

    <div v-if="loading" class="text-center py-10">Cargando...</div>
    <div v-else-if="errorMessage" class="error-banner">{{ errorMessage }}</div>
    
    <!-- La condición aquí es crucial: solo se muestra si hay formatos Y no se está mostrando el formulario -->
    <div v-else-if="formatos.length > 0 && !mostrarFormulario" class="bg-white shadow-xl rounded-lg overflow-hidden border">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-100">
            <tr>
              <th class="table-header">Nombre Formato</th>
              <th class="table-header">Descripción</th>
              <th class="table-header text-center">Campos</th>
              <th class="table-header text-center">Usuarios</th>
              <th class="table-header text-center">Activo</th>
              <th class="table-header text-right">Acciones</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="formato in formatos" :key="formato.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{{ formato.nombre_formato }}</td>
              <td class="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" :title="formato.descripcion">{{ formato.descripcion || '-' }}</td>
              <td class="px-6 py-4 text-center text-sm font-semibold">{{ formato.campos_count }}</td>
              <td class="px-6 py-4 text-center text-sm font-semibold">{{ formato.usuarios_count }}</td>
              <td class="px-6 py-4 text-center">
                <span :class="formato.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'" class="px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full">
                  {{ formato.activo ? 'Sí' : 'No' }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div class="flex justify-end items-center gap-2 flex-wrap">
                  <button @click="configurarCampos(formato.id)" class="btn-admin-action-xs btn-blue" title="Configurar Campos">Campos</button>
                  <button @click="asignarUsuarios(formato.id)" class="btn-admin-action-xs bg-purple-600 hover:bg-purple-700 text-white" title="Asignar a Usuarios">Asignar</button>
                  <button @click="abrirFormularioParaEditar(formato)" class="btn-admin-action-xs btn-yellow" title="Editar">Editar</button>
                  <button @click="eliminarFormato(formato.id)" class="btn-admin-action-xs btn-danger" title="Eliminar">Eliminar</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    
    <div v-else-if="formatos.length === 0 && !mostrarFormulario" class="text-center p-6 bg-white rounded-lg shadow">
      <p class="text-gray-600">No hay formatos de gasto configurados. ¡Crea el primero!</p>
    </div>
  </div>
</template>

<style scoped>
.table-header { @apply px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider; }
.btn-action-primary { @apply bg-blue-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-blue-700 transition shadow-md flex items-center justify-center gap-2; }
.error-banner { @apply bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md; }
.btn-admin-action-xs { @apply px-2 py-1 text-xs font-bold rounded-md shadow-sm transition-colors; }
.btn-blue { @apply bg-blue-500 hover:bg-blue-600 text-white; }
.btn-yellow { @apply bg-yellow-500 hover:bg-yellow-600 text-white; }
.btn-danger { @apply bg-red-600 hover:bg-red-700 text-white; }
</style>