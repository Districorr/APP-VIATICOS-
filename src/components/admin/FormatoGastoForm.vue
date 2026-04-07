<script setup>
import { ref, watch } from 'vue';
import { supabase } from '../../supabaseClient.js';

const props = defineProps({
  formatoAEditar: Object,
  isEditMode: Boolean,
});
const emit = defineEmits(['guardado', 'cancelar']);

const form = ref({
  id: null,
  nombre_formato: '',
  descripcion: '',
  activo: true,
});
const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

watch(() => props.formatoAEditar, (newVal) => {
  if (newVal && props.isEditMode) {
    form.value.id = newVal.id;
    form.value.nombre_formato = newVal.nombre_formato;
    form.value.descripcion = newVal.descripcion || '';
    form.value.activo = newVal.activo === undefined ? true : newVal.activo;
  } else {
    form.value.id = null;
    form.value.nombre_formato = '';
    form.value.descripcion = '';
    form.value.activo = true;
  }
}, { immediate: true, deep: true });

const handleSubmit = async () => {
  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  if (!form.value.nombre_formato.trim()) {
    errorMessage.value = 'El nombre del formato es obligatorio.';
    loading.value = false;
    return;
  }

  try {
    const payload = {
      nombre_formato: form.value.nombre_formato.trim(),
      descripcion: form.value.descripcion.trim() || null,
      activo: form.value.activo,
    };

    const { data, error } = props.isEditMode
      ? await supabase.from('formatos_gasto_config').update(payload).eq('id', form.value.id).select().single()
      : await supabase.from('formatos_gasto_config').insert(payload).select().single();

    if (error) throw error;

    successMessage.value = `¡Formato ${props.isEditMode ? 'actualizado' : 'creado'}!`;
    emit('guardado', data);

    if (!props.isEditMode) {
      form.value.nombre_formato = '';
      form.value.descripcion = '';
      form.value.activo = true;
    }
  } catch (error) {
    console.error('Error al guardar formato de gasto:', error.message);
    errorMessage.value = 'Error al guardar: ' + error.message;
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <form @submit.prevent="handleSubmit" class="space-y-4 p-4 border rounded-lg bg-white shadow">
    <h3 class="text-lg font-medium leading-6 text-gray-800">
      {{ isEditMode ? 'Editar Formato de Gasto' : 'Nuevo Formato de Gasto' }}
    </h3>
    <div>
      <label for="nombre_formato" class="block text-sm font-medium text-gray-700">Nombre del Formato <span class="text-red-500">*</span></label>
      <input type="text" id="nombre_formato" v-model="form.nombre_formato" required
             class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
    </div>
    <div>
      <label for="descripcion_formato" class="block text-sm font-medium text-gray-700">Descripción (Opcional)</label>
      <textarea id="descripcion_formato" v-model="form.descripcion" rows="3"
                class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"></textarea>
    </div>
    <div class="flex items-center">
      <input id="activo_formato" type="checkbox" v-model="form.activo"
             class="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500">
      <label for="activo_formato" class="ml-2 block text-sm text-gray-700">Activo</label>
    </div>

    <div v-if="errorMessage" class="my-2 p-2 bg-red-100 border border-red-400 text-red-700 rounded-md text-sm">
      {{ errorMessage }}
    </div>
    <div v-if="successMessage" class="my-2 p-2 bg-green-100 border border-green-400 text-green-700 rounded-md text-sm">
      {{ successMessage }}
    </div>

    <div class="flex justify-end space-x-3 pt-2">
      <button type="button" @click="emit('cancelar')"
              class="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
        Cancelar
      </button>
      <button type="submit"
              :disabled="loading"
              class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
        <span v-if="loading" class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>
        {{ loading ? 'Guardando...' : (isEditMode ? 'Actualizar Formato' : 'Crear Formato') }}
      </button>
    </div>
  </form>
</template>