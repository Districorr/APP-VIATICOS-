<script setup>
import { ref, watch, onMounted } from 'vue';
import { supabase } from '../../supabaseClient.js'; // Ajusta la ruta si tu supabaseClient está en otro lugar

const props = defineProps({
  tipoGastoAEditar: Object, // Recibe el objeto completo si estamos editando
  isEditMode: Boolean,
});

const emit = defineEmits(['guardado', 'cancelar']);

const form = ref({
  id: null,
  nombre_tipo_gasto: '',
  descripcion: '',
  activo: true,
});
const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

// Observador para llenar el formulario cuando tipoGastoAEditar cambie (para edición)
// o para resetearlo si se pasa a modo creación.
watch(() => props.tipoGastoAEditar, (newVal) => {
  if (newVal && props.isEditMode) {
    form.value.id = newVal.id;
    form.value.nombre_tipo_gasto = newVal.nombre_tipo_gasto;
    form.value.descripcion = newVal.descripcion || '';
    form.value.activo = newVal.activo === undefined ? true : newVal.activo;
  } else {
    // Resetear para modo creación o si no hay tipoGastoAEditar
    form.value.id = null;
    form.value.nombre_tipo_gasto = '';
    form.value.descripcion = '';
    form.value.activo = true;
  }
}, { immediate: true, deep: true });


const handleSubmit = async () => {
  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  if (!form.value.nombre_tipo_gasto.trim()) {
    errorMessage.value = 'El nombre del tipo de gasto es obligatorio.';
    loading.value = false;
    return;
  }

  try {
    const payload = {
      nombre_tipo_gasto: form.value.nombre_tipo_gasto.trim(),
      descripcion: form.value.descripcion.trim() || null,
      activo: form.value.activo,
    };

    let responseError;
    let responseData;

    if (props.isEditMode && form.value.id) {
      // Actualizar tipo de gasto
      const { data, error } = await supabase
        .from('tipos_gasto_config') // Nombre de tu tabla maestra
        .update(payload)
        .eq('id', form.value.id)
        .select()
        .single();
      responseData = data;
      responseError = error;
    } else {
      // Crear nuevo tipo de gasto
      const { data, error } = await supabase
        .from('tipos_gasto_config') // Nombre de tu tabla maestra
        .insert(payload)
        .select()
        .single();
      responseData = data;
      responseError = error;
    }

    if (responseError) throw responseError;

    successMessage.value = props.isEditMode ? '¡Tipo de gasto actualizado!' : '¡Tipo de gasto creado!';
    emit('guardado', responseData);

    if (!props.isEditMode) { // Solo resetear si es creación
      form.value.nombre_tipo_gasto = '';
      form.value.descripcion = '';
      form.value.activo = true;
    }
    // Opcional: limpiar mensaje de éxito después de un tiempo
    setTimeout(() => { successMessage.value = ''; }, 3000);


  } catch (error) {
    console.error('Error al guardar tipo de gasto:', error.message);
    errorMessage.value = 'Error al guardar: ' + error.message;
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <form @submit.prevent="handleSubmit" class="space-y-4 p-6 border rounded-lg bg-white shadow-md">
    <h3 class="text-lg font-medium leading-6 text-districorr-primary">
      {{ isEditMode ? 'Editar Tipo de Gasto Global' : 'Nuevo Tipo de Gasto Global' }}
    </h3>
    <div>
      <label for="nombre_tipo_gasto_global" class="block text-sm font-medium text-districorr-text-medium">Nombre del Tipo de Gasto <span class="text-red-500">*</span></label>
      <input type="text" id="nombre_tipo_gasto_global" v-model="form.nombre_tipo_gasto" required
             class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm">
    </div>
    <div>
      <label for="descripcion_tipo_gasto_global" class="block text-sm font-medium text-districorr-text-medium">Descripción (Opcional)</label>
      <textarea id="descripcion_tipo_gasto_global" v-model="form.descripcion" rows="2"
                class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm"></textarea>
    </div>
    <div class="flex items-center">
      <input id="activo_tipo_gasto_global" type="checkbox" v-model="form.activo"
             class="h-4 w-4 text-districorr-accent border-gray-300 rounded focus:ring-districorr-accent">
      <label for="activo_tipo_gasto_global" class="ml-2 block text-sm text-districorr-text-medium">Activo</label>
    </div>

    <div v-if="errorMessage" class="my-2 p-3 bg-red-100 border border-districorr-error text-districorr-error rounded-md text-sm">
      {{ errorMessage }}
    </div>
    <div v-if="successMessage" class="my-2 p-3 bg-green-100 border border-districorr-success text-districorr-success rounded-md text-sm">
      {{ successMessage }}
    </div>

    <div class="flex justify-end space-x-3 pt-2">
      <button type="button" @click="emit('cancelar')"
              class="btn btn-secondary">
        Cancelar
      </button>
      <button type="submit"
              :disabled="loading"
              class="btn btn-accent flex items-center">
        <svg v-if="loading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        {{ loading ? 'Guardando...' : (isEditMode ? 'Actualizar' : 'Crear') }}
      </button>
    </div>
  </form>
</template>

<style scoped></style>