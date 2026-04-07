// src/views/admin/AdminProveedoresView.vue
<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '../../supabaseClient.js';
import { ArrowLeftIcon } from '@heroicons/vue/24/outline';
import { useRouter } from 'vue-router';

const proveedores = ref([]);
const loading = ref(true);
const errorMessage = ref('');
const notification = ref({});

const showForm = ref(false);
const isEditMode = ref(false);
const form = ref({
  id: null,
  nombre: '',
  cuit: '',
  activo: true,
});

const router = useRouter();

// Esta es una función de utilidad que no tenías, la añado para mejorar el feedback.
const showNotification = (title, message, type = 'info') => {
  notification.value = { title, message, type, timestamp: new Date() };
};

async function fetchProveedores() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const { data, error } = await supabase.from('proveedores').select('*').order('nombre');
    if (error) throw error;
    proveedores.value = data;
  } catch (e) {
    errorMessage.value = `Error al cargar proveedores: ${e.message}`;
  } finally {
    loading.value = false;
  }
}

onMounted(fetchProveedores);

function openNewForm() {
  isEditMode.value = false;
  form.value = { id: null, nombre: '', cuit: '', activo: true };
  showForm.value = true;
}

function openEditForm(proveedor) {
  isEditMode.value = true;
  form.value = { ...proveedor };
  showForm.value = true;
}

function closeForm() {
  showForm.value = false;
}

async function handleSubmit() {
  if (!form.value.nombre) {
    alert('El nombre del proveedor es obligatorio.');
    return;
  }
  
  // --- CORRECCIÓN CLAVE ---
  // Creamos una copia limpia del payload y eliminamos el 'id'
  // que no debe ir en el cuerpo de la solicitud ni para INSERT ni para UPDATE.
  const payload = { ...form.value };
  delete payload.id; 
  // --- FIN DE LA CORRECCIÓN ---

  try {
    let error;
    if (isEditMode.value) {
      // Para UPDATE, el id va en la cláusula .eq()
      ({ error } = await supabase.from('proveedores').update(payload).eq('id', form.value.id));
    } else {
      // Para INSERT, no enviamos el id en el payload.
      ({ error } = await supabase.from('proveedores').insert(payload));
    }
    if (error) {
       if (error.code === '23505') { // Código para violación de constraint UNIQUE
        throw new Error(`El proveedor o CUIT '${form.value.nombre}' ya existe.`);
      }
      throw error;
    }
    
    showNotification('Éxito', `Proveedor ${isEditMode.value ? 'actualizado' : 'creado'} correctamente.`, 'success');
    closeForm();
    await fetchProveedores();
  } catch (e) {
    showNotification('Error', `No se pudo guardar el proveedor: ${e.message}`, 'error');
  }
}

async function handleDelete(id) {
  if (!confirm('¿Estás seguro de que quieres eliminar este proveedor?')) return;
  try {
    const { error } = await supabase.from('proveedores').delete().eq('id', id);
    if (error) throw error;
    showNotification('Éxito', 'Proveedor eliminado correctamente.', 'success');
    await fetchProveedores();
  } catch (e) {
     showNotification('Error', `No se pudo eliminar el proveedor: ${e.message}`, 'error');
  }
}
</script>
<template>
  <div class="container mx-auto px-4 py-8">
    <div class="mb-8">
       <button @click="router.push({ name: 'AdminDashboard' })" class="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeftIcon class="h-4 w-4 mr-2" />
        Volver al Dashboard de Admin
      </button>
      <div class="flex justify-between items-center">
        <h1 class="text-3xl font-bold text-gray-800">Gestión de Proveedores</h1>
        <button @click="openNewForm" class="btn-primary">+ Añadir Proveedor</button>
      </div>
    </div>
    
    <div v-if="showForm" class="mb-8 p-6 bg-gray-50 rounded-lg shadow-md border">
      <form @submit.prevent="handleSubmit" class="space-y-4">
        <h3 class="text-lg font-medium">{{ isEditMode ? 'Editar Proveedor' : 'Nuevo Proveedor' }}</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input v-model="form.nombre" placeholder="Nombre del Proveedor (ej. YPF, Shell)" required class="form-input">
          <input v-model="form.cuit" placeholder="CUIT (opcional)" class="form-input">
        </div>
        <div class="flex items-center">
          <input type="checkbox" v-model="form.activo" id="proveedor_activo" class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
          <label for="proveedor_activo" class="ml-2 text-sm text-gray-700">Proveedor Activo</label>
        </div>
        <div class="flex justify-end gap-3">
          <button type="button" @click="closeForm" class="btn-secondary">Cancelar</button>
          <button type="submit" class="btn-primary">{{ isEditMode ? 'Actualizar' : 'Guardar' }}</button>
        </div>
      </form>
    </div>

    <div v-if="loading" class="text-center py-10">Cargando...</div>
    <div v-else-if="errorMessage" class="bg-red-100 p-4 rounded-md text-red-700">{{ errorMessage }}</div>
    
    <div v-else class="bg-white shadow-lg rounded-lg overflow-hidden border">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="table-header">Nombre</th>
            <th class="table-header">CUIT</th>
            <th class="table-header text-center">Estado</th>
            <th class="table-header text-right">Acciones</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="p in proveedores" :key="p.id">
            <td class="table-cell font-semibold">{{ p.nombre }}</td>
            <td class="table-cell font-mono">{{ p.cuit }}</td>
            <td class="table-cell text-center">
              <span :class="p.activo ? 'status-badge-success' : 'status-badge-danger'">{{ p.activo ? 'Activo' : 'Inactivo' }}</span>
            </td>
            <td class="table-cell text-right space-x-2">
              <button @click="openEditForm(p)" class="btn-icon-edit">Editar</button>
              <button @click="handleDelete(p.id)" class="btn-icon-delete">Eliminar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.form-input { @apply block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm; }
.btn-primary { @apply bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-semibold shadow-sm hover:bg-indigo-700; }
.btn-secondary { @apply bg-white text-gray-700 px-4 py-2 rounded-md text-sm font-semibold shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50; }
.table-header { @apply px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider; }
.table-cell { @apply px-6 py-4 whitespace-nowrap text-sm text-gray-800; }
.status-badge-success { @apply px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800; }
.status-badge-danger { @apply px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800; }
.btn-icon-edit { @apply text-indigo-600 hover:text-indigo-900; }
.btn-icon-delete { @apply text-red-600 hover:text-red-900; }
</style>