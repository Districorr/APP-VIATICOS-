<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '../../supabaseClient.js';
import TipoGastoForm from '../../components/admin/TipoGastoForm.vue';

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
      .from('tipos_gasto_config')
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
  // No cerramos el formulario en modo edición para que el admin pueda seguir ajustando
  if (!esModoEdicion.value) {
    cerrarFormulario();
  }
};

const eliminarTipoGasto = async (id) => {
  if (!confirm('¿Estás seguro de que querés eliminar este tipo de gasto global? Esta acción no se puede deshacer.')) {
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
    <div class="flex flex-col sm:flex-row justify-between sm:items-center mb-8 gap-4">
      <h1 class="text-3xl font-bold text-districorr-primary">Gestionar Tipos de Gasto (Globales)</h1>
      <button @click="abrirFormularioParaCrear" class="btn btn-accent self-start sm:self-center">
        + Nuevo Tipo Global
      </button>
    </div>

    <!-- El formulario ahora tiene una transición para una mejor UX -->
    <transition
      enter-active-class="transition ease-out duration-300"
      enter-from-class="opacity-0 -translate-y-4"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition ease-in duration-200"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-4"
    >
      <div v-if="mostrarFormulario" class="mb-8">
        <TipoGastoForm
          :key="tipoGastoSeleccionado ? tipoGastoSeleccionado.id : 'nuevo-tipo-global'"
          :tipoGastoAEditar="tipoGastoSeleccionado"
          :isEditMode="esModoEdicion"
          @guardado="handleGuardado"
          @cancelar="cerrarFormulario"
        />
      </div>
    </transition>

    <div v-if="loading" class="text-center py-10">Cargando tipos de gasto...</div>
    <div v-else-if="errorMessage" class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md" role="alert">
      <p class="font-bold">Error</p>
      <p>{{ errorMessage }}</p>
    </div>
    <div v-else-if="tiposGastoGlobales.length === 0 && !mostrarFormulario" class="bg-white p-6 rounded-lg shadow-md text-center">
      <p class="text-gray-600">No hay tipos de gasto globales configurados.</p>
    </div>

    <!-- --- INICIO DE MI MODIFICACIÓN: Tabla Restaurada y Mejorada --- -->
    <div v-else-if="tiposGastoGlobales.length > 0" class="bg-white shadow-xl rounded-lg overflow-hidden border">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Icono</th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
              <th scope="col" class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Activo</th>
              <th scope="col" class="relative px-6 py-3"><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="tipo in tiposGastoGlobales" :key="tipo.id" class="hover:bg-gray-50 transition-colors">
              <td class="px-4 py-4 whitespace-nowrap">
                <div v-if="tipo.icono_svg" class="w-8 h-8 mx-auto" :style="{ color: tipo.color_accent }" v-html="tipo.icono_svg"></div>
                <div v-else class="w-8 h-8 mx-auto bg-gray-200 rounded-md"></div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ tipo.nombre_tipo_gasto }}</td>
              <td class="px-6 py-4 text-sm text-gray-500 truncate max-w-xs" :title="tipo.descripcion">{{ tipo.descripcion || '-' }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-center text-sm">
                <span :class="tipo.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'" class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full">
                  {{ tipo.activo ? 'Sí' : 'No' }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                <button @click="abrirFormularioParaEditar(tipo)" class="text-indigo-600 hover:text-indigo-900">Editar</button>
                <button @click="eliminarTipoGasto(tipo.id)" class="text-red-600 hover:text-red-900">Eliminar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <!-- --- FIN DE MI MODIFICACIÓN --- -->
  </div>
</template>

<style scoped>
.btn { @apply px-4 py-2 rounded-md text-sm font-semibold shadow-sm transition-colors; }
.btn-accent { @apply bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50; }
</style>