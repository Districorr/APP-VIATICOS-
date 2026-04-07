<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { supabase } from '../../supabaseClient.js';

const route = useRoute();
const router = useRouter();

const formatoId = ref(parseInt(route.params.formatoId));
const formatoInfo = ref(null);
const todosLosUsuarios = ref([]); // Lista original de todos los usuarios
const usuariosFiltrados = ref([]); // Lista que se muestra en la tabla
const usuariosSeleccionados = ref(new Set());
const loading = ref(true);
const errorMessage = ref('');
const successMessage = ref('');

// --- Nuevo estado para filtros ---
const busquedaUsuario = ref('');

// --- Propiedades Computadas ---
const nombreDelFormato = computed(() => formatoInfo.value?.nombre_formato || 'Cargando...');
const hayCambiosSinGuardar = computed(() => {
  // Esta es una lógica más compleja para detectar cambios, la implementaremos si es necesario.
  // Por ahora, nos basamos en la acción del usuario de hacer clic en "Guardar".
  return false; 
});

// --- Lógica de Carga de Datos (Mejorada) ---
async function fetchData() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [formatoResult, usuariosResult, asignadosResult] = await Promise.all([
      supabase.from('formatos_gasto_config').select('nombre_formato').eq('id', formatoId.value).single(),
      // CONSULTA MEJORADA: Directo a la tabla de perfiles
      supabase.from('perfiles').select('id, email, nombre_completo, rol').order('nombre_completo'),
      supabase.from('usuario_formatos_permitidos').select('usuario_id').eq('formato_id', formatoId.value)
    ]);

    if (formatoResult.error) throw formatoResult.error;
    formatoInfo.value = formatoResult.data;

    if (usuariosResult.error) throw usuariosResult.error;
    todosLosUsuarios.value = usuariosResult.data;
    usuariosFiltrados.value = usuariosResult.data; // Inicialmente, la lista filtrada es igual a la completa

    if (asignadosResult.error) throw asignadosResult.error;
    usuariosSeleccionados.value = new Set(asignadosResult.data.map(item => item.usuario_id));

  } catch (e) {
    errorMessage.value = `Error al cargar datos: ${e.message}`;
  } finally {
    loading.value = false;
  }
}

onMounted(fetchData);

// --- Lógica de Filtros y Asignación ---
function filtrarUsuarios() {
  const busqueda = busquedaUsuario.value.toLowerCase().trim();
  if (!busqueda) {
    usuariosFiltrados.value = todosLosUsuarios.value;
    return;
  }
  usuariosFiltrados.value = todosLosUsuarios.value.filter(user => 
    user.nombre_completo?.toLowerCase().includes(busqueda) ||
    user.email?.toLowerCase().includes(busqueda)
  );
}

const toggleSeleccionUsuario = (userId) => {
  if (usuariosSeleccionados.value.has(userId)) {
    usuariosSeleccionados.value.delete(userId);
  } else {
    usuariosSeleccionados.value.add(userId);
  }
};

async function handleGuardarAsignaciones() {
  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    // Borramos solo las asignaciones de los usuarios que se muestran actualmente (o de todos)
    // Para simplificar, borramos todas las de este formato y reinsertamos.
    const { error: deleteError } = await supabase
      .from('usuario_formatos_permitidos')
      .delete()
      .eq('formato_id', formatoId.value);
    if (deleteError) throw deleteError;

    if (usuariosSeleccionados.value.size > 0) {
      const nuevasAsignaciones = Array.from(usuariosSeleccionados.value).map(userId => ({
        formato_id: formatoId.value,
        usuario_id: userId,
      }));
      const { error: insertError } = await supabase
        .from('usuario_formatos_permitidos')
        .insert(nuevasAsignaciones);
      if (insertError) throw insertError;
    }
    successMessage.value = "Asignaciones guardadas correctamente.";
    setTimeout(() => successMessage.value = '', 3000);
  } catch (e) {
    errorMessage.value = `Error al guardar asignaciones: ${e.message}`;
  } finally {
    loading.value = false;
  }
}

const volverAFormatos = () => {
  router.push({ name: 'AdminFormatosGasto' });
};
</script>
<template>
  <div class="container mx-auto px-4 py-8">
    <div class="mb-6">
      <button @click="volverAFormatos" class="text-sm text-districorr-accent hover:text-districorr-primary font-medium inline-flex items-center group">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 mr-1.5 transform group-hover:-translate-x-0.5 transition-transform"><path fill-rule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clip-rule="evenodd" /></svg>
        Volver a Gestión de Formatos
      </button>
    </div>
    <h1 class="text-2xl sm:text-3xl font-bold text-districorr-primary mb-2">
      Asignar Usuarios al Formato
    </h1>
    <p class="text-lg text-districorr-accent mb-6">
      <span class="font-semibold">{{ nombreDelFormato }}</span>
    </p>

    <div v-if="loading" class="text-center py-12">Cargando...</div>
    <div v-else-if="errorMessage" class="error-banner">{{ errorMessage }}</div>
    
    <div v-else class="bg-white shadow-xl rounded-lg overflow-hidden border">
      <div class="p-4 sm:p-6 border-b border-gray-200">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <p class="text-sm text-gray-600 max-w-2xl">
            Selecciona los usuarios que tendrán acceso a este formato.
          </p>
          <div class="w-full sm:w-auto">
            <input type="text" v-model="busquedaUsuario" @input="filtrarUsuarios" placeholder="Buscar por nombre o email..."
                   class="w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-districorr-accent focus:border-districorr-accent">
          </div>
        </div>
      </div>

      <div v-if="successMessage" class="m-4 p-3 bg-green-100 text-green-700 rounded-md text-sm">{{ successMessage }}</div>

      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="table-header">Nombre Completo</th>
              <th class="table-header hidden md:table-cell">Email</th>
              <th class="table-header hidden sm:table-cell">Rol Actual</th>
              <th class="table-header text-center w-32">Asignar</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-if="usuariosFiltrados.length === 0">
              <td colspan="4" class="px-6 py-12 text-center text-gray-500">No se encontraron usuarios.</td>
            </tr>
            <tr v-for="usuario in usuariosFiltrados" :key="usuario.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">{{ usuario.nombre_completo || '(No especificado)' }}</div>
                <div class="text-xs text-gray-500 md:hidden">{{ usuario.email }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden md:table-cell">{{ usuario.email }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm hidden sm:table-cell">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full" :class="usuario.rol === 'admin' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'">
                  {{ usuario.rol || 'N/A' }}
                </span>
              </td>
              <td class="px-6 py-4 text-center">
                <input type="checkbox" :checked="usuariosSeleccionados.has(usuario.id)" @change="toggleSeleccionUsuario(usuario.id)"
                       class="h-5 w-5 text-districorr-accent border-gray-300 rounded focus:ring-2 focus:ring-districorr-accent cursor-pointer">
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="p-4 sm:px-6 py-3 bg-gray-50 border-t flex justify-end">
        <button @click="handleGuardarAsignaciones" :disabled="loading" class="btn btn-primary w-full sm:w-auto">
          {{ loading ? 'Guardando...' : 'Guardar Asignaciones' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.table-header { @apply px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider; }
.btn { @apply px-4 py-2 border rounded-md shadow-sm text-sm font-medium disabled:opacity-50; }
.btn-primary { @apply border-transparent text-white bg-districorr-primary hover:bg-opacity-90; }
.error-banner { @apply bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md; }
</style>