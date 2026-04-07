<script setup>
import { ref, watch, computed } from 'vue';
import { supabase } from '../../supabaseClient.js';

const props = defineProps({
  tipoGastoAEditar: Object,
  isEditMode: Boolean,
});

const emit = defineEmits(['guardado', 'cancelar']);

const form = ref({
  id: null,
  nombre_tipo_gasto: '',
  descripcion: '',
  activo: true,
  icono_svg: '',
  color_accent: '#4f46e5',
  es_tipo_transporte: false, // <-- NUEVA PROPIEDAD
});

const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const iconGallery = [
  { name: 'Comida', svg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 12.75a9.75 9.75 0 11-19.5 0 9.75 9.75 0 0119.5 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>` },
  { name: 'Transporte', svg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125V14.25m-17.25 4.5v-1.875a3.375 3.375 0 013.375-3.375h1.5a1.125 1.125 0 011.125 1.125v-1.5a3.375 3.375 0 00-3.375-3.375H5.25m5.25 9v-4.5m0 4.5h.75M12 14.25h.75m-4.5 4.5H12m-4.5-4.5H12" /></svg>` },
  { name: 'Alojamiento', svg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>` },
  { name: 'Peajes', svg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 6.75V15m6-8.25V15m-6-8.25h6l-3 3-3-3z" /></svg>` },
  { name: 'Oficina', svg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" /></svg>` },
  { name: 'Regalo', svg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>` },
  { name: 'Salud', svg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>` },
  { name: 'Herramientas', svg: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>` },
];

const selectSuggestedIcon = (svg) => {
  form.value.icono_svg = svg;
};

const previewIconColor = computed(() => {
  return form.value.color_accent || '#cccccc';
});

watch(() => props.tipoGastoAEditar, (newVal) => {
  if (newVal && props.isEditMode) {
    form.value.id = newVal.id;
    form.value.nombre_tipo_gasto = newVal.nombre_tipo_gasto;
    form.value.descripcion = newVal.descripcion || '';
    form.value.activo = newVal.activo === undefined ? true : newVal.activo;
    form.value.icono_svg = newVal.icono_svg || '';
    form.value.color_accent = newVal.color_accent || '#4f46e5';
    form.value.es_tipo_transporte = newVal.es_tipo_transporte || false; // <-- NUEVA PROPIEDAD
  } else {
    form.value = {
      id: null,
      nombre_tipo_gasto: '',
      descripcion: '',
      activo: true,
      icono_svg: '',
      color_accent: '#4f46e5',
      es_tipo_transporte: false, // <-- NUEVA PROPIEDAD
    };
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
      icono_svg: form.value.icono_svg.trim() || null,
      color_accent: form.value.color_accent,
      es_tipo_transporte: form.value.es_tipo_transporte, // <-- NUEVA PROPIEDAD
    };

    let responseError;
    let responseData;

    if (props.isEditMode && form.value.id) {
      const { data, error } = await supabase.from('tipos_gasto_config').update(payload).eq('id', form.value.id).select().single();
      responseData = data;
      responseError = error;
    } else {
      const { data, error } = await supabase.from('tipos_gasto_config').insert(payload).select().single();
      responseData = data;
      responseError = error;
    }

    if (responseError) throw responseError;

    successMessage.value = props.isEditMode ? '¡Tipo de gasto actualizado!' : '¡Tipo de gasto creado!';
    emit('guardado', responseData);

    if (!props.isEditMode) {
      // Resetear solo en modo creación
      form.value.nombre_tipo_gasto = '';
      form.value.descripcion = '';
      form.value.activo = true;
      form.value.icono_svg = '';
      form.value.color_accent = '#4f46e5';
      form.value.es_tipo_transporte = false;
    }
    setTimeout(() => { successMessage.value = ''; }, 3000);

  } catch (error) {
    errorMessage.value = 'Error al guardar tipo de gasto: ' + error.message;
  } finally {
    loading.value = false;
  }
};
</script>
<template>
  <form @submit.prevent="handleSubmit" class="space-y-6 p-4 sm:p-6 border rounded-lg bg-white shadow-md">
    <h3 class="text-lg font-medium leading-6 text-gray-900">
      {{ isEditMode ? 'Editar Tipo de Gasto' : 'Nuevo Tipo de Gasto' }}
    </h3>
    
    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
      <!-- Columna Izquierda: Datos Principales -->
      <div class="space-y-4">
        <div>
          <label for="nombre_tipo_gasto_global" class="form-label">Nombre <span class="text-red-500">*</span></label>
          <input type="text" id="nombre_tipo_gasto_global" v-model="form.nombre_tipo_gasto" required class="form-input">
        </div>
        <div>
          <label for="descripcion_tipo_gasto_global" class="form-label">Descripción (Opcional)</label>
          <textarea id="descripcion_tipo_gasto_global" v-model="form.descripcion" rows="2" class="form-input"></textarea>
        </div>
        <div class="flex items-center pt-2">
          <input id="activo_tipo_gasto_global" type="checkbox" v-model="form.activo" class="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500">
          <label for="activo_tipo_gasto_global" class="ml-2 block text-sm text-gray-900">Activo</label>
        </div>
        
        <!-- --- INICIO DE LA MODIFICACIÓN --- -->
        <div class="flex items-center pt-2">
          <input id="es_tipo_transporte" type="checkbox" v-model="form.es_tipo_transporte" class="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500">
          <label for="es_tipo_transporte" class="ml-2 block text-sm text-gray-900">Es un tipo de transporte</label>
        </div>
        <p class="text-xs text-gray-500 -mt-2 ml-6">Marcar esto mostrará los campos de Origen/Destino en el formulario de gastos.</p>
        <!-- --- FIN DE LA MODIFICACIÓN --- -->

      </div>

      <!-- Columna Derecha: Icono y Color -->
      <div class="space-y-4">
        <div>
          <label for="color_accent" class="form-label">Color de Acento</label>
          <div class="flex items-center gap-2 mt-1">
            <input type="text" id="color_accent" v-model="form.color_accent" class="form-input w-28 text-sm">
            <label for="color_picker" class="block w-8 h-8 rounded-md border border-gray-300 cursor-pointer" :style="{ backgroundColor: form.color_accent }"></label>
            <input type="color" id="color_picker" v-model="form.color_accent" class="absolute opacity-0 w-0 h-0">
          </div>
        </div>
        <div>
          <label for="icono_svg" class="form-label">Icono (SVG)</label>
          <div class="flex items-start gap-4 mt-1">
            <div class="flex-grow">
              <textarea id="icono_svg" v-model="form.icono_svg" rows="3" class="form-input font-mono text-xs" placeholder="Pega aquí el código <svg>..."></textarea>
              <p class="text-xs text-gray-500 mt-1">O selecciona uno de la galería de sugerencias.</p>
            </div>
            <div class="w-12 h-12 p-2 border rounded-lg flex-shrink-0 flex items-center justify-center bg-gray-50">
              <div v-if="form.icono_svg" class="w-full h-full" :style="{ color: previewIconColor }" v-html="form.icono_svg"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Galería de Iconos -->
    <div class="pt-4 border-t">
      <p class="form-label mb-2">Sugerencias de Iconos</p>
      <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
        <button
          v-for="icon in iconGallery" :key="icon.name"
          type="button"
          @click="selectSuggestedIcon(icon.svg)"
          class="p-2 border rounded-lg flex flex-col items-center justify-center aspect-square transition-all duration-150"
          :class="form.icono_svg === icon.svg 
            ? 'bg-indigo-100 border-indigo-500 ring-2 ring-indigo-400' 
            : 'bg-gray-50 hover:bg-indigo-50 hover:border-indigo-400'"
          :title="icon.name"
        >
          <div class="w-6 h-6 text-gray-600" v-html="icon.svg"></div>
          <span class="text-xs mt-1 text-gray-500 truncate w-full">{{ icon.name }}</span>
        </button>
      </div>
    </div>

    <div v-if="errorMessage" class="my-2 p-3 bg-red-100 border border-red-500 text-red-700 rounded-md text-sm">
      {{ errorMessage }}
    </div>
    <div v-if="successMessage" class="my-2 p-3 bg-green-100 border border-green-600 text-green-800 rounded-md text-sm">
      {{ successMessage }}
    </div>

    <div class="flex justify-end space-x-3 pt-4 border-t mt-6">
      <button type="button" @click="emit('cancelar')" class="btn btn-secondary">Cancelar</button>
      <button type="submit" :disabled="loading" class="btn btn-accent flex items-center">
        <svg v-if="loading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        {{ loading ? 'Guardando...' : (isEditMode ? 'Actualizar' : 'Crear') }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.form-label { @apply block text-sm font-medium text-gray-700; }
.form-input { @apply block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm; }
.btn { @apply px-4 py-2 rounded-md text-sm font-semibold shadow-sm transition-colors; }
.btn-accent { @apply bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50; }
.btn-secondary { @apply bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50; }
</style>