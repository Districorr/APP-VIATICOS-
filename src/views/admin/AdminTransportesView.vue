<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '../../supabaseClient.js';
import { useRouter } from 'vue-router';

const router = useRouter();
const transportes = ref([]);
const loading = ref(true);
const errorMessage = ref('');

// --- Estado del Formulario ---
const mostrarFormulario = ref(false);
const esModoEdicion = ref(false);
const form = ref({
  id: null,
  nombre: ''
});

// --- Lógica CRUD ---
async function fetchTransportes() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const { data, error } = await supabase
      .from('transportes')
      .select('*')
      .order('nombre', { ascending: true });
    if (error) throw error;
    transportes.value = data;
  } catch (e) {
    errorMessage.value = `Error al cargar transportes: ${e.message}`;
  } finally {
    loading.value = false;
  }
}

onMounted(fetchTransportes);

function abrirFormularioParaCrear() {
  esModoEdicion.value = false;
  form.value = { id: null, nombre: '' };
  mostrarFormulario.value = true;
}

function abrirFormularioParaEditar(transporte) {
  esModoEdicion.value = true;
  form.value = { ...transporte };
  mostrarFormulario.value = true;
}

function cerrarFormulario() {
  mostrarFormulario.value = false;
}

async function handleGuardado() {
  if (!form.value.nombre?.trim()) {
    alert("El nombre del transporte es obligatorio.");
    return;
  }

  loading.value = true;
  try {
    const payload = {
      nombre: form.value.nombre.trim()
    };

    const { error } = esModoEdicion.value
      ? await supabase.from('transportes').update(payload).eq('id', form.value.id)
      : await supabase.from('transportes').insert(payload);

    if (error) throw error;

    cerrarFormulario();
    await fetchTransportes();
  } catch (e) {
    alert(`Error al guardar el transporte: ${e.message}`);
  } finally {
    loading.value = false;
  }
}

async function eliminarTransporte(transporteId) {
  if (!confirm("¿Estás seguro de que querés eliminar este transporte?")) return;
  try {
    const { error } = await supabase.from('transportes').delete().eq('id', transporteId);
    if (error) throw error;
    await fetchTransportes();
  } catch (e) {
    alert(`Error al eliminar el transporte: ${e.message}`);
  }
}
</script>
<template>
  <div class="container mx-auto px-4 py-8">
    <div class="mb-6">
      <router-link :to="{ name: 'AdminDashboard' }" class="text-districorr-accent hover:underline">
        ← Volver al Panel de Admin
      </router-link>
    </div>

    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold text-districorr-primary">Gestionar Transportes</h1>
      <button @click="abrirFormularioParaCrear" class="btn btn-primary flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
        Nuevo Transporte
      </button>
    </div>

    <!-- Formulario de Creación/Edición -->
    <div v-if="mostrarFormulario" class="mb-8 p-4 bg-gray-50 rounded-lg shadow-inner border">
      <form @submit.prevent="handleGuardado" class="space-y-4">
        <h3 class="text-lg font-medium text-gray-800">{{ esModoEdicion ? 'Editar Transporte' : 'Nuevo Transporte' }}</h3>
        <div>
          <label for="nombre_transporte" class="form-label">Nombre del Transporte <span class="text-red-500">*</span></label>
          <input type="text" id="nombre_transporte" v-model="form.nombre" required class="form-input">
        </div>
        <div class="flex justify-end gap-3">
          <button type="button" @click="cerrarFormulario" class="btn btn-secondary">Cancelar</button>
          <button type="submit" :disabled="loading" class="btn btn-primary">{{ loading ? 'Guardando...' : 'Guardar' }}</button>
        </div>
      </form>
    </div>

    <!-- Tabla de Transportes -->
    <div v-if="loading" class="text-center py-10">Cargando transportes...</div>
    <div v-else-if="errorMessage" class="bg-red-100 p-4 rounded-md text-red-700">{{ errorMessage }}</div>
    <div v-else class="bg-white shadow-xl rounded-lg overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-100">
          <tr>
            <th class="table-header">ID</th>
            <th class="table-header">Nombre del Transporte</th>
            <th class="table-header text-right">Acciones</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-if="transportes.length === 0">
            <td colspan="3" class="px-6 py-12 text-center text-gray-500">No hay transportes registrados.</td>
          </tr>
          <tr v-for="transporte in transportes" :key="transporte.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 text-sm text-gray-500">{{ transporte.id }}</td>
            <td class="px-6 py-4 text-sm font-medium text-gray-900">{{ transporte.nombre }}</td>
            <td class="px-6 py-4 text-right text-sm font-medium space-x-2">
              <button @click="abrirFormularioParaEditar(transporte)" class="btn-admin-action-xs btn-yellow">Editar</button>
              <button @click="eliminarTransporte(transporte.id)" class="btn-admin-action-xs btn-danger">Eliminar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.form-label { @apply block text-sm font-medium text-gray-700; }
.form-input { @apply mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm; }
.table-header { @apply px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider; }
.btn { @apply px-4 py-2 border rounded-md shadow-sm text-sm font-medium disabled:opacity-50; }
.btn-primary { @apply border-transparent text-white bg-districorr-accent hover:bg-opacity-90; }
.btn-secondary { @apply border-gray-300 text-gray-700 bg-white hover:bg-gray-50; }
</style>