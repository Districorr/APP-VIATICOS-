<script setup>
import { ref, watch, onMounted } from 'vue';
import { supabase } from '../../supabaseClient.js'; // Ajusta la ruta si tu supabaseClient está en otro lado

const props = defineProps({
  formatoId: { // El ID del formato al que pertenece este campo
    type: [Number, String],
    required: true
  },
  campoAEditar: { // Objeto del campo si estamos editando
    type: Object,
    default: null
  },
  isEditMode: Boolean
});

const emit = defineEmits(['guardado', 'cancelar']);

const form = ref({
  id: null, // Solo para edición
  formato_id: parseInt(props.formatoId), // Asegurarse que sea número
  nombre_campo_tecnico: '',
  etiqueta_visible: '',
  tipo_dato: 'texto_corto', // Valor por defecto
  es_obligatorio: false,
  opciones_selector: '', // String separado por comas para las opciones
  orden_visualizacion: 0,
});

const tiposDeDatoDisponibles = [
  { value: 'texto_corto', label: 'Texto Corto (Input)' },
  { value: 'texto_largo', label: 'Texto Largo (Textarea)' },
  { value: 'numero', label: 'Número' },
  { value: 'fecha', label: 'Fecha' },
  { value: 'booleano', label: 'Sí/No (Checkbox)' },
  { value: 'selector_simple', label: 'Selector Simple (Dropdown)' },
  // { value: 'archivo_adjunto', label: 'Archivo Adjunto' }, // Lo manejaremos de forma especial en GastoForm
];

const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

watch(() => props.campoAEditar, (newVal) => {
  if (newVal && props.isEditMode) {
    form.value.id = newVal.id;
    form.value.formato_id = parseInt(newVal.formato_id); // Asegurar que sea número
    form.value.nombre_campo_tecnico = newVal.nombre_campo_tecnico;
    form.value.etiqueta_visible = newVal.etiqueta_visible;
    form.value.tipo_dato = newVal.tipo_dato;
    form.value.es_obligatorio = newVal.es_obligatorio;
    // Convertir array de opciones a string separado por comas para el input
    form.value.opciones_selector = Array.isArray(newVal.opciones_selector) ? newVal.opciones_selector.join(', ') : '';
    form.value.orden_visualizacion = newVal.orden_visualizacion || 0;
  } else {
    // Resetear para modo creación, manteniendo el formato_id
    form.value.id = null;
    form.value.formato_id = parseInt(props.formatoId);
    form.value.nombre_campo_tecnico = '';
    form.value.etiqueta_visible = '';
    form.value.tipo_dato = 'texto_corto';
    form.value.es_obligatorio = false;
    form.value.opciones_selector = '';
    form.value.orden_visualizacion = 0;
  }
}, { immediate: true, deep: true });

const generarNombreTecnico = () => {
  if (form.value.etiqueta_visible && !props.isEditMode && !form.value.nombre_campo_tecnico) {
    form.value.nombre_campo_tecnico = form.value.etiqueta_visible
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar acentos
      .replace(/\s+/g, '_') // Reemplazar espacios con guiones bajos
      .replace(/[^\w-]+/g, ''); // Quitar caracteres no alfanuméricos excepto guion bajo
  }
};

const handleSubmit = async () => {
  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  if (!form.value.nombre_campo_tecnico.trim() || !form.value.etiqueta_visible.trim() || !form.value.tipo_dato) {
    errorMessage.value = 'Nombre técnico, etiqueta y tipo de dato son obligatorios.';
    loading.value = false;
    return;
  }
  // Validar que nombre_campo_tecnico no tenga espacios ni caracteres especiales (solo letras, números, guion bajo)
   if (!/^[a-zA-Z0-9_]+$/.test(form.value.nombre_campo_tecnico.trim())) {
     errorMessage.value = 'El nombre técnico solo puede contener letras, números y guiones bajos (sin espacios).';
     loading.value = false;
     return;
   }


  try {
    const payload = {
      formato_id: form.value.formato_id,
      nombre_campo_tecnico: form.value.nombre_campo_tecnico.trim(),
      etiqueta_visible: form.value.etiqueta_visible.trim(),
      tipo_dato: form.value.tipo_dato,
      es_obligatorio: form.value.es_obligatorio,
      // Convertir string de opciones a array JSON si es selector_simple
      opciones_selector: form.value.tipo_dato === 'selector_simple' && form.value.opciones_selector.trim()
        ? form.value.opciones_selector.split(',').map(opt => opt.trim()).filter(opt => opt) // Crea array y filtra vacíos
        : null,
      orden_visualizacion: parseInt(form.value.orden_visualizacion) || 0,
    };

    let responseData;
    let responseError;

    if (props.isEditMode && form.value.id) {
      const { data, error } = await supabase
        .from('campos_formato_config')
        .update(payload)
        .eq('id', form.value.id)
        .select()
        .single();
      responseData = data;
      responseError = error;
    } else {
      const { data, error } = await supabase
        .from('campos_formato_config')
        .insert(payload)
        .select()
        .single();
      responseData = data;
      responseError = error;
    }

    if (responseError) throw responseError;

    successMessage.value = props.isEditMode ? '¡Campo actualizado!' : '¡Campo creado!';
    emit('guardado', responseData);

    if (!props.isEditMode) { // Resetear solo en modo creación
      form.value.nombre_campo_tecnico = '';
      form.value.etiqueta_visible = '';
      form.value.tipo_dato = 'texto_corto';
      form.value.es_obligatorio = false;
      form.value.opciones_selector = '';
      form.value.orden_visualizacion = 0;
    }
  } catch (error) {
    console.error('Error al guardar campo de formato:', error.message);
    errorMessage.value = 'Error al guardar: ' + (error.details || error.message);
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <form @submit.prevent="handleSubmit" class="space-y-4 p-4 border border-gray-300 rounded-lg bg-white shadow-sm">
    <h4 class="text-md font-medium leading-6 text-districorr-primary border-b pb-2 mb-4">
      {{ isEditMode ? 'Editar Campo del Formato' : 'Añadir Nuevo Campo al Formato' }}
    </h4>

    <div>
      <label for="etiqueta_visible" class="block text-sm font-medium text-districorr-text-medium">Etiqueta Visible (cómo lo ve el usuario) <span class="text-red-500">*</span></label>
      <input type="text" id="etiqueta_visible" v-model="form.etiqueta_visible" @blur="generarNombreTecnico" required
             class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm">
    </div>

    <div>
      <label for="nombre_campo_tecnico" class="block text-sm font-medium text-districorr-text-medium">Nombre Técnico (sin espacios/especiales, ej: 'monto_hotel') <span class="text-red-500">*</span></label>
      <input type="text" id="nombre_campo_tecnico" v-model="form.nombre_campo_tecnico" required pattern="^[a-zA-Z0-9_]+$"
             title="Solo letras, números y guion bajo, sin espacios."
             class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm">
      <p class="mt-1 text-xs text-gray-500">Este será el nombre de la columna en la base de datos (dentro del JSON).</p>
    </div>

    <div>
      <label for="tipo_dato" class="block text-sm font-medium text-districorr-text-medium">Tipo de Dato <span class="text-red-500">*</span></label>
      <select id="tipo_dato" v-model="form.tipo_dato" required
              class="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm">
        <option v-for="tipo in tiposDeDatoDisponibles" :key="tipo.value" :value="tipo.value">{{ tipo.label }}</option>
      </select>
    </div>

    <div v-if="form.tipo_dato === 'selector_simple'">
      <label for="opciones_selector" class="block text-sm font-medium text-districorr-text-medium">Opciones del Selector (separadas por coma)</label>
      <input type="text" id="opciones_selector" v-model="form.opciones_selector"
             class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm"
             placeholder="Ej: Opción 1, Opción 2, Otra Opción">
    </div>

    <div class="flex items-start">
      <div class="flex items-center h-5">
        <input id="es_obligatorio" type="checkbox" v-model="form.es_obligatorio"
               class="focus:ring-districorr-accent h-4 w-4 text-districorr-accent border-gray-300 rounded">
      </div>
      <div class="ml-3 text-sm">
        <label for="es_obligatorio" class="font-medium text-districorr-text-medium">¿Es obligatorio?</label>
      </div>
    </div>

     <div>
      <label for="orden_visualizacion" class="block text-sm font-medium text-districorr-text-medium">Orden de Visualización</label>
      <input type="number" id="orden_visualizacion" v-model.number="form.orden_visualizacion" min="0"
             class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-districorr-accent focus:border-districorr-accent sm:text-sm">
       <p class="mt-1 text-xs text-gray-500">Un número menor aparece antes. Usar para ordenar los campos en el formulario final.</p>
    </div>


    <div v-if="errorMessage" class="my-2 p-2 bg-red-100 border border-districorr-error text-districorr-error rounded-md text-sm">
      {{ errorMessage }}
    </div>
    <div v-if="successMessage" class="my-2 p-2 bg-green-100 border border-districorr-success text-districorr-success rounded-md text-sm">
      {{ successMessage }}
    </div>

    <div class="flex justify-end space-x-3 pt-2">
      <button type="button" @click="emit('cancelar')"
              class="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
        Cancelar
      </button>
      <button type="submit"
              :disabled="loading"
              class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-districorr-accent hover:bg-opacity-80 disabled:opacity-50">
        <span v-if="loading" class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>
        {{ loading ? 'Guardando...' : (isEditMode ? 'Actualizar Campo' : 'Añadir Campo') }}
      </button>
    </div>
  </form>
</template>

<style scoped></style>