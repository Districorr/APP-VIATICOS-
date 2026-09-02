<template>
  <div class="destino-select-container relative">
    <div class="flex items-center gap-2">
      <div class="flex-1 min-w-0">
        <v-select
          v-model="selectedDestino"
          :options="computedDestinosOptions"
          :loading="loading"
          :disabled="disabled"
          :placeholder="placeholder"
          :filter-by="filterDestinos"
          label="label"
          class="v-select-destino w-full"
          :class="{ 'v-select-required': required && (!provinciaId || !localidadId) }"
          @search="onSearchTextChange"
        >
          <template #no-options="{ search }">
            <div class="p-3 text-center text-xs text-slate-500">
              <p v-if="search">No se encontró "{{ search }}".</p>
              <p v-else>Escriba para buscar una localidad o provincia...</p>
              <button
                type="button"
                @click="abrirModalCrear(search)"
                class="mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-lg transition active:scale-95"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                Crear nueva localidad
              </button>
            </div>
          </template>

          <template #selected-option="option">
            <div class="flex items-center justify-between w-full min-w-0 py-0.5 pr-1">
              <span class="font-medium text-slate-900 text-sm truncate mr-2">{{ option.localidad_nombre }}</span>
              <span class="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                {{ option.provincia_nombre }}
              </span>
            </div>
          </template>

          <template #option="option">
            <div class="flex items-center justify-between py-1 px-0.5 w-full min-w-0">
              <span class="localidad-text font-medium text-slate-800 text-sm truncate mr-2">{{ option.localidad_nombre }}</span>
              <span class="provincia-badge text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                {{ option.provincia_nombre }}
              </span>
            </div>
          </template>
        </v-select>
      </div>

      <button
        type="button"
        @click="abrirModalCrear(currentSearchText)"
        title="Crear nueva localidad vinculada a provincia"
        class="shrink-0 h-[38px] w-[38px] flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100 rounded-lg transition border border-slate-300"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>

    <!-- MODAL INLINE: CREAR NUEVA LOCALIDAD VINCULADA OBLIGATORIAMENTE A PROVINCIA -->
    <transition
      enter-active-class="transition ease-out duration-200"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition ease-in duration-150"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div v-if="showModalCrear" class="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
        <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 border border-slate-200 space-y-4" @click.stop>
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 class="text-base font-bold text-slate-800 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Nueva Localidad
            </h3>
            <button type="button" @click="showModalCrear = false" class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="space-y-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Nombre de la Localidad *</label>
              <input
                v-model="nuevaLocalidad.nombre"
                type="text"
                placeholder="Ej: San Vicente"
                class="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                @keyup.enter="guardarNuevaLocalidad"
              />
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Provincia Obligatoria *</label>
              <select
                v-model="nuevaLocalidad.provincia_id"
                class="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
              >
                <option :value="null" disabled>-- Seleccione Provincia --</option>
                <option v-for="prov in provinciasOptions" :key="prov.id" :value="prov.id">
                  {{ prov.nombre }}
                </option>
              </select>
            </div>

            <p v-if="errorCrear" class="text-xs font-semibold text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-200">
              {{ errorCrear }}
            </p>
          </div>

          <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              @click="showModalCrear = false"
              class="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              @click="guardarNuevaLocalidad"
              :disabled="savingLocalidad"
              class="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl transition shadow-xs flex items-center gap-2"
            >
              <svg v-if="savingLocalidad" class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>{{ savingLocalidad ? 'Guardando...' : 'Guardar y Seleccionar' }}</span>
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';
import { useDestinosUnificados, OPCION_TODAS_LOCALIDADES } from '../composables/useDestinosUnificados.js';

const props = defineProps({
  provinciaId: { type: [Number, String], default: null },
  localidadId: { type: [Number, String], default: null },
  placeholder: { type: String, default: 'Buscar localidad o provincia (ej: San Vicente, Misiones)...' },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  includeAllOption: { type: Boolean, default: false },
});

const emit = defineEmits(['update:provinciaId', 'update:localidadId', 'change']);

const { destinosOptions, provinciasOptions, loading, cargarDestinos, crearLocalidad, findDestinoOption } = useDestinosUnificados();

const computedDestinosOptions = computed(() => {
  if (props.includeAllOption) {
    return [OPCION_TODAS_LOCALIDADES, ...destinosOptions.value];
  }
  return destinosOptions.value;
});

const selectedDestino = ref(null);
const currentSearchText = ref('');
const showModalCrear = ref(false);
const savingLocalidad = ref(false);
const errorCrear = ref('');

const nuevaLocalidad = reactive({
  nombre: '',
  provincia_id: null,
});

function syncFromProps() {
  if (!destinosOptions.value.length) return;
  const match = findDestinoOption(props.localidadId, props.provinciaId);
  selectedDestino.value = match || null;
}

onMounted(async () => {
  await cargarDestinos();
  syncFromProps();
});

watch([() => props.localidadId, () => props.provinciaId, destinosOptions], () => {
  syncFromProps();
}, { immediate: true });

watch(selectedDestino, (newVal) => {
  if (newVal && typeof newVal === 'object') {
    emit('update:provinciaId', newVal.provincia_id);
    emit('update:localidadId', newVal.localidad_id);
    emit('change', { provincia_id: newVal.provincia_id, localidad_id: newVal.localidad_id, option: newVal });
  } else {
    emit('update:provinciaId', null);
    emit('update:localidadId', null);
    emit('change', { provincia_id: null, localidad_id: null, option: null });
  }
});

function onSearchTextChange(search) {
  currentSearchText.value = search;
}

function filterDestinos(option, label, search) {
  if (!search) return true;
  const term = search.toLowerCase().trim();
  const locName = (option.localidad_nombre || '').toLowerCase();
  const provName = (option.provincia_nombre || '').toLowerCase();
  const fullLabel = (option.label || '').toLowerCase();
  return locName.includes(term) || provName.includes(term) || fullLabel.includes(term);
}

function abrirModalCrear(initialText = '') {
  errorCrear.value = '';
  nuevaLocalidad.nombre = (initialText || '').trim();
  nuevaLocalidad.provincia_id = props.provinciaId ? Number(props.provinciaId) : null;
  showModalCrear.value = true;
}

async function guardarNuevaLocalidad() {
  errorCrear.value = '';
  if (!nuevaLocalidad.nombre.trim()) {
    errorCrear.value = 'El nombre de la localidad es obligatorio.';
    return;
  }
  if (!nuevaLocalidad.provincia_id) {
    errorCrear.value = 'Debe seleccionar la provincia a la que pertenece.';
    return;
  }

  savingLocalidad.value = true;
  try {
    const createdOption = await crearLocalidad({
      nombre: nuevaLocalidad.nombre,
      provincia_id: nuevaLocalidad.provincia_id,
    });
    selectedDestino.value = createdOption;
    showModalCrear.value = false;
  } catch (e) {
    console.error('Error creando localidad:', e);
    errorCrear.value = e.message || 'Error al guardar la nueva localidad.';
  } finally {
    savingLocalidad.value = false;
  }
}
</script>

<style scoped>
.v-select-destino :deep(.vs__dropdown-toggle) {
  border-radius: 0.5rem; /* rounded-lg */
  border-color: #cbd5e1;
  padding-top: 1px;
  padding-bottom: 1px;
  background-color: #ffffff;
  min-height: 38px;
}

.v-select-destino :deep(.vs__search) {
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: #0f172a;
}

@media (max-width: 640px) {
  .v-select-destino :deep(.vs__search) {
    font-size: 16px; /* Evita zoom automático molesto en iOS Safari */
  }
}

.v-select-destino :deep(.vs__dropdown-menu) {
  max-height: 280px;
  border-radius: 0.75rem;
  border-color: #e2e8f0;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
  z-index: 9999 !important;
  padding: 4px 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

@media (max-width: 640px) {
  .v-select-destino :deep(.vs__dropdown-menu) {
    max-height: 220px;
  }
}

.v-select-destino :deep(.vs__dropdown-option) {
  padding: 8px 12px;
  color: #1e293b;
}

/* Estado al pasar el cursor o navegar con teclado */
.v-select-destino :deep(.vs__dropdown-option--highlight) {
  background-color: #4f46e5 !important;
  color: #ffffff !important;
}

.v-select-destino :deep(.vs__dropdown-option--highlight .localidad-text) {
  color: #ffffff !important;
}

.v-select-destino :deep(.vs__dropdown-option--highlight .provincia-badge) {
  background-color: rgba(255, 255, 255, 0.25) !important;
  color: #ffffff !important;
  border-color: rgba(255, 255, 255, 0.4) !important;
}

.v-select-required :deep(.vs__dropdown-toggle) {
  border-color: #f87171;
}
</style>
