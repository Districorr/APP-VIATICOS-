<script setup>
import { ref, onMounted, watch } from 'vue';
import { supabase } from '../../supabaseClient.js';
import TipoGastoForm from '../../components/admin/TipoGastoForm.vue';

const tiposGastoGlobales = ref([]);
const loading = ref(true);
const errorMessage = ref('');

const mostrarFormulario = ref(false);
const tipoGastoSeleccionado = ref(null);
const esModoEdicion = ref(false);

// --- INICIO: LÓGICA PARA ASIGNACIÓN DE PERMISOS ---
const showAssignModal = ref(false);
const loadingAssign = ref(false);
const tipoGastoParaAsignar = ref(null);
const todosLosUsuarios = ref([]);
const usuariosAsignados = ref(new Set());
// --- FIN: LÓGICA PARA ASIGNACIÓN DE PERMISOS ---

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
    errorMessage.value = 'No se pudieron cargar los tipos de gasto globales.';
  } finally {
    loading.value = false;
  }
};

// --- INICIO: NUEVA FUNCIÓN PARA CARGAR USUARIOS ---
const fetchUsuarios = async () => {
  try {
    const { data, error } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, email')
      .neq('rol', 'admin') // Excluimos a los admins ya que siempre tienen acceso
      .order('nombre_completo');
    if (error) throw error;
    todosLosUsuarios.value = data;
  } catch (error) {
    errorMessage.value = `No se pudieron cargar los usuarios: ${error.message}`;
  }
};
// --- FIN: NUEVA FUNCIÓN PARA CARGAR USUARIOS ---

onMounted(() => {
  fetchTiposGastoGlobales();
  fetchUsuarios(); // Cargamos los usuarios al montar
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
  if (!esModoEdicion.value) {
    cerrarFormulario();
  }
};

const eliminarTipoGasto = async (id) => {
  if (!confirm('¿Estás seguro de que querés eliminar este tipo de gasto global?')) return;
  try {
    const { error } = await supabase.from('tipos_gasto_config').delete().eq('id', id);
    if (error) throw error;
    fetchTiposGastoGlobales();
  } catch (error) {
    alert('Error al eliminar: ' + error.message);
  }
};

// --- INICIO: FUNCIONES PARA EL MODAL DE ASIGNACIÓN ---
const abrirModalAsignacion = async (tipoGasto) => {
  tipoGastoParaAsignar.value = tipoGasto;
  loadingAssign.value = true;
  showAssignModal.value = true;
  try {
    const { data, error } = await supabase
      .from('usuario_tipos_gasto_permitidos')
      .select('user_id')
      .eq('tipo_gasto_id', tipoGasto.id);
    if (error) throw error;
    usuariosAsignados.value = new Set(data.map(p => p.user_id));
  } catch (e) {
    errorMessage.value = `Error al cargar asignaciones: ${e.message}`;
  } finally {
    loadingAssign.value = false;
  }
};

const handleUserSelection = (userId, isChecked) => {
  const newSet = new Set(usuariosAsignados.value);
  if (isChecked) {
    newSet.add(userId);
  } else {
    newSet.delete(userId);
  }
  usuariosAsignados.value = newSet;
};

const guardarAsignaciones = async () => {
  if (!tipoGastoParaAsignar.value) return;
  loadingAssign.value = true;
  errorMessage.value = '';
  try {
    // 1. Borrar todas las asignaciones existentes para este tipo de gasto
    const { error: deleteError } = await supabase
      .from('usuario_tipos_gasto_permitidos')
      .delete()
      .eq('tipo_gasto_id', tipoGastoParaAsignar.value.id);
    if (deleteError) throw deleteError;

    // 2. Insertar las nuevas asignaciones
    const nuevasAsignaciones = Array.from(usuariosAsignados.value).map(userId => ({
      user_id: userId,
      tipo_gasto_id: tipoGastoParaAsignar.value.id
    }));

    if (nuevasAsignaciones.length > 0) {
      const { error: insertError } = await supabase
        .from('usuario_tipos_gasto_permitidos')
        .insert(nuevasAsignaciones);
      if (insertError) throw insertError;
    }
    
    showAssignModal.value = false;
  } catch (e) {
    errorMessage.value = `Error al guardar asignaciones: ${e.message}`;
  } finally {
    loadingAssign.value = false;
  }
};
// --- FIN: FUNCIONES PARA EL MODAL DE ASIGNACIÓN ---
</script>
<template>
  <div class="container mx-auto px-4 py-8">
    <div class="flex flex-col sm:flex-row justify-between sm:items-center mb-8 gap-4">
      <h1 class="text-3xl font-bold text-districorr-primary">Gestionar Tipos de Gasto (Globales)</h1>
      <button @click="abrirFormularioParaCrear" class="btn btn-accent self-start sm:self-center">
        + Nuevo Tipo Global
      </button>
    </div>

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

    <div v-else-if="tiposGastoGlobales.length > 0" class="bg-white shadow-xl rounded-lg overflow-hidden border">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th scope="col" class="table-header w-16">Icono</th>
              <th scope="col" class="table-header">Nombre</th>
              <th scope="col" class="table-header">Descripción</th>
              <th scope="col" class="table-header text-center">Activo</th>
              <th scope="col" class="table-header text-right">Acciones</th>
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
                <!-- INICIO: NUEVO BOTÓN DE ASIGNAR -->
                <button @click="abrirModalAsignacion(tipo)" class="text-gray-500 hover:text-indigo-600 font-semibold">Asignar</button>
                <!-- FIN: NUEVO BOTÓN DE ASIGNAR -->
                <button @click="abrirFormularioParaEditar(tipo)" class="text-indigo-600 hover:text-indigo-900">Editar</button>
                <button @click="eliminarTipoGasto(tipo.id)" class="text-red-600 hover:text-red-900">Eliminar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- INICIO: MODAL DE ASIGNACIÓN DE PERMISOS -->
    <div v-if="showAssignModal" class="fixed inset-0 bg-gray-600 bg-opacity-75 z-50 flex justify-center items-center p-4">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div class="p-4 border-b">
          <h3 class="text-lg font-semibold text-gray-900">Asignar Usuarios a: <span class="text-indigo-600">{{ tipoGastoParaAsignar.nombre_tipo_gasto }}</span></h3>
          <p class="text-sm text-gray-500">Selecciona los usuarios que podrán utilizar este tipo de gasto.</p>
        </div>
        
        <div class="p-6 overflow-y-auto">
          <div v-if="loadingAssign" class="text-center">Cargando...</div>
          <div v-else-if="todosLosUsuarios.length === 0" class="text-center text-gray-500">No hay usuarios (no-administradores) para asignar.</div>
          <div v-else class="space-y-4">
            <div v-for="usuario in todosLosUsuarios" :key="usuario.id" class="relative flex items-start">
              <div class="flex h-6 items-center">
                <input 
                  :id="`user-${usuario.id}`" 
                  type="checkbox" 
                  :checked="usuariosAsignados.has(usuario.id)"
                  @change="handleUserSelection(usuario.id, $event.target.checked)"
                  class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                />
              </div>
              <div class="ml-3 text-sm leading-6">
                <label :for="`user-${usuario.id}`" class="font-medium text-gray-900">{{ usuario.nombre_completo }}</label>
                <p class="text-gray-500">{{ usuario.email }}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="p-4 bg-gray-50 border-t flex justify-end gap-3">
          <button @click="showAssignModal = false" class="btn-secondary">Cancelar</button>
          <button @click="guardarAsignaciones" :disabled="loadingAssign" class="btn-accent">
            {{ loadingAssign ? 'Guardando...' : 'Guardar Cambios' }}
          </button>
        </div>
      </div>
    </div>
    <!-- FIN: MODAL DE ASIGNACIÓN DE PERMISOS -->
  </div>
</template>

<style scoped>
.btn { @apply px-4 py-2 rounded-md text-sm font-semibold shadow-sm transition-colors; }
.btn-accent { @apply bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50; }
.btn-secondary { @apply bg-white text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50; }
.table-header { @apply px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider; }
</style>