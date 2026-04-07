<script setup>
import { ref, watch } from 'vue';
import { supabase } from '../../supabaseClient.js';

const props = defineProps({
  formatoId: { type: [Number, String], required: true },
  campoAEditar: Object,
  isEditMode: Boolean,
});
const emit = defineEmits(['guardado', 'cancelar']);

const form = ref({});
const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

// --- INICIO DE LA MODIFICACIÓN ---
// Añadimos la nueva opción para el selector de transportes.
const tiposDeInputDisponibles = ref([
  { value: 'texto', label: 'Texto Corto' },
  { value: 'numero', label: 'Número' },
  { value: 'select_cliente', label: 'Selector de Clientes' },
  { value: 'select_transporte', label: 'Selector de Transportes' }, // <-- NUEVA OPCIÓN
  { value: 'select_proveedor', label: 'Selector de Proveedores' }, // <-- Añadido para consistencia
  { value: 'selector_simple', label: 'Selector con Opciones Manuales' },
]);
// --- FIN DE LA MODIFICACIÓN ---

watch(() => props.campoAEditar, (newVal) => {
  if (newVal && props.isEditMode) {
    form.value = { ...newVal };
    if (Array.isArray(newVal.opciones_selector)) {
      form.value.opciones_selector_str = newVal.opciones_selector.join(', ');
    }
  } else {
    form.value = {
      nombre_campo_tecnico: '',
      etiqueta_visible: '',
      tipo_input: 'texto',
      es_obligatorio: false,
      orden_visualizacion: 10,
      opciones_selector_str: '',
    };
  }
  errorMessage.value = '';
  successMessage.value = '';
}, { immediate: true, deep: true });

function autocompletarNombreTecnico() {
  if (!props.isEditMode && form.value.etiqueta_visible) {
    form.value.nombre_campo_tecnico = form.value.etiqueta_visible
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/__+/g, '_');
  }
}

const handleSubmit = async () => {
  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  if (!form.value.etiqueta_visible?.trim() || !form.value.nombre_campo_tecnico?.trim()) {
    errorMessage.value = 'La Etiqueta y el Nombre Técnico son obligatorios.';
    loading.value = false; return;
  }
  if (/\s/.test(form.value.nombre_campo_tecnico)) {
    errorMessage.value = 'El Nombre Técnico no puede contener espacios.';
    loading.value = false; return;
  }

  try {
    const payload = {
      formato_id: props.formatoId,
      nombre_campo_tecnico: form.value.nombre_campo_tecnico,
      etiqueta_visible: form.value.etiqueta_visible,
      tipo_input: form.value.tipo_input,
      es_obligatorio: form.value.es_obligatorio,
      orden_visualizacion: form.value.orden_visualizacion,
      opciones_selector: form.value.tipo_input === 'selector_simple'
        ? form.value.opciones_selector_str.split(',').map(opt => opt.trim()).filter(Boolean)
        : null,
    };

    const { data, error } = props.isEditMode
      ? await supabase.from('campos_formato_config').update(payload).eq('id', form.value.id).select().single()
      : await supabase.from('campos_formato_config').insert(payload).select().single();

    if (error) throw error;

    successMessage.value = `¡Campo ${props.isEditMode ? 'actualizado' : 'creado'}!`;
    emit('guardado', data);

  } catch (error) {
    console.error('Error al guardar el campo:', error.message);
    errorMessage.value = 'Error al guardar: ' + error.message;
  } finally {
    loading.value = false;
  }
};
</script>
<template>
  <form @submit.prevent="handleSubmit" class="space-y-4 p-4 border-2 border-dashed rounded-lg bg-white shadow-sm">
    <h3 class="text-lg font-medium leading-6 text-districorr-primary">
      {{ isEditMode ? `Editando Campo: ${campoAEditar.etiqueta_visible}` : 'Nuevo Campo para el Formato' }}
    </h3>
    
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label for="etiqueta_visible" class="form-label">Etiqueta Visible <span class="text-red-500">*</span></label>
        <input type="text" id="etiqueta_visible" v-model="form.etiqueta_visible" @blur="autocompletarNombreTecnico" required class="form-input">
        <p class="form-hint">El nombre que verá el usuario en el formulario.</p>
      </div>
      <div>
        <label for="nombre_campo_tecnico" class="form-label">Nombre Técnico (sin espacios) <span class="text-red-500">*</span></label>
        <input type="text" id="nombre_campo_tecnico" v-model="form.nombre_campo_tecnico" required pattern="[a-z0-9_]+" class="form-input font-mono">
        <p class="form-hint">La clave en la BD (ej: `numero_remito`).</p>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label for="tipo_input" class="form-label">Tipo de Input <span class="text-red-500">*</span></label>
        <select id="tipo_input" v-model="form.tipo_input" required class="form-input">
          <option v-for="tipo in tiposDeInputDisponibles" :key="tipo.value" :value="tipo.value">
            {{ tipo.label }}
          </option>
        </select>
        <p class="form-hint">Cómo se mostrará este campo en el formulario.</p>
      </div>
      <div>
        <label for="orden_visualizacion" class="form-label">Orden de Visualización</label>
        <input type="number" id="orden_visualizacion" v-model.number="form.orden_visualizacion" class="form-input">
        <p class="form-hint">Un número más bajo aparece primero.</p>
      </div>
    </div>

    <!-- Campo condicional para las opciones del selector -->
    <div v-if="form.tipo_input === 'selector_simple'">
      <label for="opciones_selector" class="form-label">Opciones del Selector</label>
      <input type="text" id="opciones_selector" v-model="form.opciones_selector_str" class="form-input" placeholder="Opción 1, Opción 2, Opción 3">
      <p class="form-hint">Escribe las opciones separadas por comas.</p>
    </div>

    <div class="flex items-center">
      <input id="es_obligatorio" type="checkbox" v-model="form.es_obligatorio" class="h-4 w-4 text-districorr-accent border-gray-300 rounded focus:ring-districorr-accent">
      <label for="es_obligatorio" class="ml-2 block text-sm text-gray-900">Este campo es obligatorio</label>
    </div>

    <div v-if="errorMessage" class="my-2 p-2 bg-red-100 border border-red-500 text-red-700 rounded-md text-sm">
      {{ errorMessage }}
    </div>
    <div v-if="successMessage" class="my-2 p-2 bg-green-100 border border-green-500 text-green-700 rounded-md text-sm">
      {{ successMessage }}
    </div>

    <div class="flex justify-end space-x-3 pt-2">
      <button type="button" @click="emit('cancelar')" class="btn btn-secondary">Cancelar</button>
      <button type="submit" :disabled="loading" class="btn btn-primary">
        {{ loading ? 'Guardando...' : (isEditMode ? 'Actualizar Campo' : 'Crear Campo') }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.form-label { @apply block text-sm font-medium text-gray-700; }
.form-input { @apply mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm; }
.form-hint { @apply mt-1 text-xs text-gray-500; }
.btn { @apply px-4 py-2 border rounded-md shadow-sm text-sm font-medium disabled:opacity-50; }
.btn-primary { @apply border-transparent text-white bg-districorr-accent hover:bg-opacity-90; }
.btn-secondary { @apply border-gray-300 text-gray-700 bg-white hover:bg-gray-50; }
</style>