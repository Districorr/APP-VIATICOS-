<!-- src/views/admin/AdminVehiculosView.vue -->
<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '../../supabaseClient.js';

const vehiculos = ref([]);
const loading = ref(true);
const errorMessage = ref('');

const showForm = ref(false);
const isEditMode = ref(false);
const form = ref({
  id: null,
  patente: '',
  marca: '',
  modelo: '',
  ano: null,
  activo: true,
});

async function fetchVehiculos() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const { data, error } = await supabase.from('vehiculos').select('*').order('marca').order('modelo');
    if (error) throw error;
    vehiculos.value = data;
  } catch (e) {
    errorMessage.value = `Error al cargar vehículos: ${e.message}`;
  } finally {
    loading.value = false;
  }
}

onMounted(fetchVehiculos);

function openNewForm() {
  isEditMode.value = false;
  form.value = { id: null, patente: '', marca: '', modelo: '', ano: new Date().getFullYear(), activo: true };
  showForm.value = true;
}

function openEditForm(vehiculo) {
  isEditMode.value = true;
  form.value = { ...vehiculo };
  showForm.value = true;
}

function closeForm() {
  showForm.value = false;
}

async function handleSubmit() {
  if (!form.value.patente) {
    alert('La patente es obligatoria.');
    return;
  }
  
  const payload = { ...form.value };
  delete payload.id; // No se debe enviar el id en el payload

  try {
    let error;
    if (isEditMode.value) {
      ({ error } = await supabase.from('vehiculos').update(payload).eq('id', form.value.id));
    } else {
      ({ error } = await supabase.from('vehiculos').insert(payload));
    }
    if (error) throw error;
    
    closeForm();
    await fetchVehiculos();
  } catch (e) {
    alert(`Error al guardar el vehículo: ${e.message}`);
  }
}

async function handleDelete(id) {
  if (!confirm('¿Estás seguro de que quieres eliminar este vehículo?')) return;
  try {
    const { error } = await supabase.from('vehiculos').delete().eq('id', id);
    if (error) throw error;
    await fetchVehiculos();
  } catch (e) {
    alert(`Error al eliminar el vehículo: ${e.message}`);
  }
}
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <div class="flex justify-between items-center mb-8">
      <h1 class="text-3xl font-bold text-gray-800">Gestión de Flota de Vehículos</h1>
      <button @click="openNewForm" class="btn-primary">+ Añadir Vehículo</button>
    </div>

    <div v-if="showForm" class="mb-8 p-6 bg-gray-50 rounded-lg shadow-md border">
      <form @submit.prevent="handleSubmit" class="space-y-4">
        <h3 class="text-lg font-medium">{{ isEditMode ? 'Editar Vehículo' : 'Nuevo Vehículo' }}</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <input v-model="form.patente" placeholder="Patente (ej. AA123BB)" required class="form-input">
          <input v-model="form.marca" placeholder="Marca (ej. Toyota)" class="form-input">
          <input v-model="form.modelo" placeholder="Modelo (ej. Hilux)" class="form-input">
          <input v-model.number="form.ano" type="number" placeholder="Año (ej. 2022)" class="form-input">
        </div>
        <div class="flex items-center">
          <input type="checkbox" v-model="form.activo" id="vehiculo_activo" class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
          <label for="vehiculo_activo" class="ml-2 text-sm text-gray-700">Vehículo Activo</label>
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
            <th class="table-header">Patente</th>
            <th class="table-header">Marca</th>
            <th class="table-header">Modelo</th>
            <th class="table-header">Año</th>
            <th class="table-header text-center">Estado</th>
            <th class="table-header text-right">Acciones</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="v in vehiculos" :key="v.id">
            <td class="table-cell font-mono font-semibold">{{ v.patente }}</td>
            <td class="table-cell">{{ v.marca }}</td>
            <td class="table-cell">{{ v.modelo }}</td>
            <td class="table-cell">{{ v.ano }}</td>
            <td class="table-cell text-center">
              <span :class="v.activo ? 'status-badge-success' : 'status-badge-danger'">{{ v.activo ? 'Activo' : 'Inactivo' }}</span>
            </td>
            <td class="table-cell text-right space-x-2">
              <button @click="openEditForm(v)" class="btn-icon-edit">Editar</button>
              <button @click="handleDelete(v.id)" class="btn-icon-delete">Eliminar</button>
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