<script setup>
import { ref, onMounted, computed } from 'vue'; // Añadido computed
import { supabase } from '../../supabaseClient.js'; // Ajusta la ruta
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const formatoId = ref(route.params.formatoId);
const formatoInfo = ref(null); // Contendrá { id, nombre_formato, descripcion }
const todosLosUsuarios = ref([]); // Lista de { id, email, nombre_completo, rol, ... }
const usuariosSeleccionados = ref(new Set()); // IDs de usuarios asignados

const loadingFormato = ref(true);
const loadingUsuarios = ref(true);
const loadingAsignacion = ref(false);

const errorMessage = ref('');
const successMessage = ref('');

// Propiedad computada para el nombre del formato (para el template)
const nombreDelFormato = computed(() => formatoInfo.value?.nombre_formato || 'Cargando formato...');

// Propiedad computada para el estado de carga general de la vista inicial
const isLoadingView = computed(() => loadingFormato.value || loadingUsuarios.value);

async function fetchFormatoDetalles() {
  loadingFormato.value = true;
  errorMessage.value = '';
  try {
    const { data, error } = await supabase
      .from('formatos_gasto_config')
      .select('id, nombre_formato, descripcion')
      .eq('id', formatoId.value)
      .single();
    if (error && error.code !== 'PGRST116') throw error; // PGRST116: No rows found
    if (data) {
      formatoInfo.value = data;
    } else {
      formatoInfo.value = null;
      errorMessage.value = `No se encontró el formato con ID: ${formatoId.value}`;
    }
  } catch (e) {
    errorMessage.value = `Error cargando detalles del formato: ${e.message}`;
    console.error("Error en fetchFormatoDetalles:", e);
  } finally {
    loadingFormato.value = false;
  }
}

async function fetchUsuariosYaAsignados() {
  // Limpiar antes de cargar
  usuariosSeleccionados.value.clear();
  try {
    const { data, error } = await supabase
      .from('usuario_formatos_permitidos')
      .select('usuario_id')
      .eq('formato_id', formatoId.value);
    if (error) throw error;
    if (data) {
        data.forEach(item => usuariosSeleccionados.value.add(item.usuario_id));
    }
    console.log("Usuarios ya asignados cargados:", Array.from(usuariosSeleccionados.value));
  } catch (e) {
    console.error("Error cargando usuarios ya asignados:", e.message);
    // No es crítico si esto falla, pero la UI no mostrará los checks correctos
  }
}

async function fetchTodosLosUsuariosConEdgeFunction() {
  loadingUsuarios.value = true;
  // No limpiar errorMessage aquí, podría haber un error de fetchFormatoDetalles
  try {
    console.log("AdminAsignarUsuarios: Llamando a Edge Function 'get-all-users'");
    const { data, error: functionError } = await supabase.functions.invoke('get-all-users');

    if (functionError) throw functionError;

    if (data && data.error) throw new Error(data.error);
    
    if (data && data.users) {
      todosLosUsuarios.value = data.users.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
      console.log("AdminAsignarUsuarios: Usuarios recibidos:", todosLosUsuarios.value);
    } else {
      todosLosUsuarios.value = [];
      console.warn("Respuesta inesperada o sin usuarios de Edge Function 'get-all-users':", data);
    }
  } catch (err) {
    errorMessage.value = (errorMessage.value ? errorMessage.value + '\n' : '') + `Error al cargar lista de usuarios: ${err.message}`;
    todosLosUsuarios.value = [];
  } finally {
    loadingUsuarios.value = false;
  }
}

const handleGuardarAsignaciones = async () => {
  loadingAsignacion.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const { error: deleteError } = await supabase
      .from('usuario_formatos_permitidos')
      .delete()
      .eq('formato_id', formatoId.value);
    if (deleteError) throw deleteError;

    if (usuariosSeleccionados.value.size > 0) {
      const nuevasAsignaciones = Array.from(usuariosSeleccionados.value).map(userId => ({
        formato_id: parseInt(formatoId.value),
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
    console.error("Error en handleGuardarAsignaciones:", e);
  } finally {
    loadingAsignacion.value = false;
  }
};

onMounted(async () => {
  // Poner todos los loaders principales en true al inicio del mounted
  loadingFormato.value = true;
  loadingUsuarios.value = true; 

  await Promise.allSettled([
    fetchFormatoDetalles(),
    fetchUsuariosYaAsignados(), // Cargar qué usuarios ya están asignados
    fetchTodosLosUsuariosConEdgeFunction()
  ]);
  // Los loaders individuales se ponen en false dentro de sus respectivas funciones
});

const isUsuarioSeleccionado = (userId) => {
  return usuariosSeleccionados.value.has(userId);
};

const toggleSeleccionUsuario = (userId) => {
  if (usuariosSeleccionados.value.has(userId)) {
    usuariosSeleccionados.value.delete(userId);
  } else {
    usuariosSeleccionados.value.add(userId);
  }
};
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <div class="mb-6">
      <button @click="router.push({ name: 'AdminFormatosGasto' })" class="text-sm text-districorr-accent hover:text-districorr-primary font-medium inline-flex items-center group">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 mr-1.5 transform group-hover:-translate-x-0.5 transition-transform duration-150"><path fill-rule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clip-rule="evenodd" /></svg>
        Volver a Gestión de Formatos
      </button>
    </div>
    <h1 class="text-2xl sm:text-3xl font-bold text-districorr-primary mb-2">
      Asignar Usuarios al Formato
    </h1>
    <p v-if="formatoInfo" class="text-lg text-districorr-accent mb-6">
      Editando asignaciones para: <span class="font-semibold">{{ nombreDelFormato }}</span>
      <span v-if="formatoInfo.descripcion" class="block text-sm text-gray-500 mt-1 italic">"{{ formatoInfo.descripcion }}"</span>
    </p>
     <p v-else-if="loadingFormato" class="text-lg text-gray-500 mb-6">Cargando información del formato...</p>


    <div v-if="isLoadingView" class="text-center py-12"> <!-- Usando isLoadingView -->
      <svg class="animate-spin h-10 w-10 text-districorr-primary mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <p class="mt-3 text-gray-600">Cargando información y usuarios...</p>
    </div>
    <div v-else-if="errorMessage" class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md shadow" role="alert">
      <p class="font-bold">Error</p>
      <p class="whitespace-pre-line">{{ errorMessage }}</p>
    </div>
    <div v-else-if="todosLosUsuarios.length === 0 && !loadingUsuarios" class="bg-white p-8 rounded-xl shadow-lg text-center">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-3.741-1.588M18 18.72a9.094 9.094 0 01-3.741-.479 3 3 0 013.741-1.588m-3.741 2.066c.058.049.117.1.175.148m-.175-.148a3.006 3.006 0 00-2.632 2.632m2.632-2.632S15 15 12 15s-3.892 2.632-3.892 2.632m7.784 0A12.007 12.007 0 0112 21a12.007 12.007 0 01-7.784-2.368m15.568 0A12.007 12.007 0 0012 3.75a12.007 12.007 0 00-7.784 2.368m15.568 0L12 12.75M3.75 6.375L12 12.75m0 0l8.25-6.375M12 12.75v8.25" /></svg>
      <p class="text-gray-700 text-xl">No hay usuarios para asignar.</p>
      <p class="text-sm text-gray-500 mt-1">La lista de usuarios está vacía o no se pudo cargar.</p>
    </div>

    <div v-else class="bg-white shadow-xl rounded-lg overflow-hidden border border-gray-200">
      <div v-if="successMessage" class="m-4 p-3 bg-green-100 border border-green-300 text-green-700 rounded-md text-sm shadow-sm">
        {{ successMessage }}
      </div>
      <div class="p-4 sm:p-6 border-b border-gray-200">
        <p class="text-sm text-gray-600">
          Selecciona los usuarios a los que deseas asignar el formato
          <strong class="text-districorr-accent">{{ nombreDelFormato }}</strong>.
          Los usuarios marcados tendrán este formato disponible (o como predeterminado si se configura así en su perfil).
        </p>
      </div>
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre Completo</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rol Actual</th>
            <th scope="col" class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Asignar Formato</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="usuario in todosLosUsuarios" :key="usuario.id" class="hover:bg-gray-50/75 transition-colors">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ usuario.nombre_completo || '(No especificado)' }}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ usuario.email }}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
              <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                    :class="usuario.rol === 'admin' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'">
                {{ usuario.rol || 'N/A' }}
              </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
              <input
                type="checkbox"
                :id="`user-assign-${usuario.id}`"
                :checked="isUsuarioSeleccionado(usuario.id)"
                @change="toggleSeleccionUsuario(usuario.id)"
                class="h-5 w-5 text-districorr-accent border-gray-300 rounded focus:ring-2 focus:ring-districorr-accent cursor-pointer"
              >
            </td>
          </tr>
        </tbody>
      </table>
      <div class="p-4 sm:px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-end">
        <button @click="handleGuardarAsignaciones" 
                :disabled="loadingAsignacion"
                class="w-full sm:w-auto inline-flex justify-center items-center px-6 py-2.5 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-districorr-primary hover:bg-opacity-85 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-districorr-accent disabled:opacity-60">
          <svg v-if="loadingAsignacion" class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          {{ loadingAsignacion ? 'Guardando...' : 'Guardar Cambios de Asignación' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Estilos específicos si fueran necesarios */
</style>