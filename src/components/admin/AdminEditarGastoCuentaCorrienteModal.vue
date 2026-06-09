<script setup>
import { computed, inject, ref, watch } from 'vue';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';

import { supabase } from '../../supabaseClient';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  gasto: { type: Object, default: null },
  proveedores: { type: Array, default: () => [] },
  transportes: { type: Array, default: () => [] },
  loadingOptions: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'saved']);
const userProfile = inject('userProfile', ref(null));

const loadingGasto = ref(false);
const saving = ref(false);
const creatingProveedor = ref(false);
const errorMessage = ref('');
const proveedorFeedbackMessage = ref('');
const gastoCompleto = ref(null);
const proveedorSearchText = ref('');
const showCreateProveedorForm = ref(false);
const newProveedorNombre = ref('');
const newProveedorCuit = ref('');
const proveedorOptions = ref([]);
const form = ref({
  fecha_gasto: '',
  monto_total: '',
  descripcion_general: '',
  proveedor_id: null,
  transporte_id: null,
  numero_factura: '',
  paciente_referido: '',
  tipo_movimiento_encomienda: '',
  numero_guia: '',
});

const gastoId = computed(() => props.gasto?.id || props.gasto?.gasto_id || null);
const isAdmin = computed(() => userProfile.value?.rol === 'admin');
const canCreateProveedor = computed(() => {
  return isAdmin.value && proveedorSearchText.value.trim().length > 0;
});

const getRowValue = (keys, fallback = null) => {
  for (const key of keys) {
    if (props.gasto?.[key] !== undefined && props.gasto?.[key] !== null && props.gasto?.[key] !== '') {
      return props.gasto[key];
    }
  }
  return fallback;
};

const editableLogisticOrigins = new Set(['cuenta_corriente_empresa', 'rendicion', 'caja_chica']);
const normalizeOrigin = (value) => String(value || '').trim().toLowerCase().replaceAll(' ', '_');

const isEditableLogisticExpense = computed(() => {
  const origen = gastoCompleto.value?.origen_gasto || getRowValue(['origen_gasto', 'modalidad_imputacion', 'modalidad']);
  return editableLogisticOrigins.has(normalizeOrigin(origen));
});

function closeModal() {
  if (saving.value) return;
  emit('update:modelValue', false);
}

function mapErrorMessage(message = '') {
  if (message.includes('No autorizado. Solo administradores pueden editar datos logísticos de gastos.')) {
    return 'No tenés permisos para editar este registro.';
  }
  if (message.includes('No autorizado')) return 'No tenés permisos para editar este registro.';
  return 'No se pudo actualizar el registro. Revisá los datos e intentá nuevamente.';
}

function mapProveedorCreateError(message = '') {
  if (message.includes('No autorizado')) return 'No tenes permisos para crear proveedores.';
  if (message.includes('nombre del proveedor es obligatorio')) return 'Ingresa un nombre de proveedor.';
  return 'No se pudo crear el proveedor. Revisa los datos e intenta nuevamente.';
}

function resetCreateProveedorForm() {
  showCreateProveedorForm.value = false;
  newProveedorNombre.value = '';
  newProveedorCuit.value = '';
}

function hydrateForm(gasto) {
  const datosAdicionales = gasto?.datos_adicionales || props.gasto?.datos_adicionales || {};
  form.value = {
    fecha_gasto: String(gasto?.fecha_gasto || getRowValue(['fecha_gasto', 'fecha'], '')).slice(0, 10),
    monto_total: gasto?.monto_total ?? getRowValue(['monto_total', 'monto', 'total'], ''),
    descripcion_general: gasto?.descripcion_general ?? getRowValue(['descripcion_general', 'descripcion', 'detalle'], ''),
    proveedor_id: gasto?.proveedor_id ?? getRowValue(['proveedor_id'], null),
    transporte_id: gasto?.transporte_id ?? getRowValue(['transporte_id'], null),
    numero_factura: gasto?.numero_factura ?? getRowValue(['numero_factura', 'numero_guia'], ''),
    paciente_referido: gasto?.paciente_referido ?? getRowValue(['paciente_referido', 'paciente', 'nombre_paciente'], ''),
    tipo_movimiento_encomienda: datosAdicionales.tipo_movimiento_encomienda || getRowValue(['tipo_movimiento_encomienda', 'tipo_movimiento'], ''),
    numero_guia: datosAdicionales.numero_guia || getRowValue(['numero_guia'], ''),
  };
}

async function loadGastoCompleto() {
  if (!gastoId.value) return;
  loadingGasto.value = true;
  errorMessage.value = '';
  try {
    const { data, error } = await supabase
      .from('gastos')
      .select('id, fecha_gasto, monto_total, descripcion_general, proveedor_id, transporte_id, numero_factura, paciente_referido, datos_adicionales, origen_gasto, estado_delegacion, viaje_id, caja_id, vehiculo_id')
      .eq('id', gastoId.value)
      .single();
    if (error) throw error;
    gastoCompleto.value = data;
    hydrateForm(data);
  } catch (e) {
    gastoCompleto.value = null;
    hydrateForm(null);
    errorMessage.value = e.message || 'No se pudo cargar el gasto completo.';
  } finally {
    loadingGasto.value = false;
  }
}

async function createProveedorFromModal() {
  if (!isAdmin.value) {
    errorMessage.value = 'No tenes permisos para crear proveedores.';
    return;
  }
  const nombreProveedorTrim = newProveedorNombre.value.trim();
  if (!nombreProveedorTrim) {
    errorMessage.value = 'Ingresa un nombre de proveedor.';
    return;
  }

  creatingProveedor.value = true;
  errorMessage.value = '';
  proveedorFeedbackMessage.value = '';
  try {
    const { data, error } = await supabase.rpc('admin_crear_proveedor_basico', {
      p_nombre: nombreProveedorTrim,
      p_cuit: newProveedorCuit.value.trim() || null,
    });
    if (error) throw error;

    const proveedorCreado = Array.isArray(data) ? data[0] : data;
    if (!proveedorCreado?.id) throw new Error('Respuesta invalida al crear proveedor.');

    const alreadyExists = proveedorOptions.value.some((item) => String(item.code) === String(proveedorCreado.id));
    if (!alreadyExists) {
      proveedorOptions.value.push({
        label: proveedorCreado.nombre,
        code: proveedorCreado.id,
      });
      proveedorOptions.value.sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'es'));
    }

    form.value.proveedor_id = proveedorCreado.id;
    proveedorSearchText.value = '';
    proveedorFeedbackMessage.value = 'Proveedor creado y seleccionado correctamente.';
    resetCreateProveedorForm();
  } catch (e) {
    errorMessage.value = mapProveedorCreateError(e.message || '');
  } finally {
    creatingProveedor.value = false;
  }
}

function validateForm() {
  if (!isEditableLogisticExpense.value) {
    errorMessage.value = 'Este gasto no corresponde al contexto de encomiendas/logística y no puede editarse desde esta pantalla.';
    return false;
  }
  if (!form.value.fecha_gasto) {
    errorMessage.value = 'La fecha del gasto es obligatoria.';
    return false;
  }
  const monto = Number(form.value.monto_total);
  if (!Number.isFinite(monto) || monto < 0) {
    errorMessage.value = 'El monto total debe ser mayor o igual a 0.';
    return false;
  }
  return true;
}

async function saveGasto() {
  errorMessage.value = '';
  if (!validateForm()) return;

  saving.value = true;
  try {
    const datosAdicionales = {
      ...(gastoCompleto.value?.datos_adicionales || props.gasto?.datos_adicionales || {}),
      tipo_movimiento_encomienda: form.value.tipo_movimiento_encomienda || null,
      numero_guia: form.value.numero_guia || null,
    };

    const { error } = await supabase.rpc('admin_actualizar_datos_logisticos_gasto', {
      p_gasto_id: gastoId.value,
      p_proveedor_id: form.value.proveedor_id || null,
      p_transporte_id: form.value.transporte_id || null,
      p_fecha_gasto: form.value.fecha_gasto || null,
      p_monto_total: Number(form.value.monto_total),
      p_descripcion_general: form.value.descripcion_general?.trim() || null,
      p_numero_factura: form.value.numero_factura?.trim() || null,
      p_paciente_referido: form.value.paciente_referido?.trim() || null,
      p_datos_adicionales: datosAdicionales,
    });

    if (error) throw error;
    emit('saved');
    emit('update:modelValue', false);
  } catch (e) {
    errorMessage.value = mapErrorMessage(e.message || '');
  } finally {
    saving.value = false;
  }
}

watch(() => props.modelValue, (isOpen) => {
  if (!isOpen) return;
  proveedorFeedbackMessage.value = '';
  resetCreateProveedorForm();
  hydrateForm(props.gasto);
  loadGastoCompleto();
});

watch(() => props.proveedores, (items) => {
  proveedorOptions.value = [...(items || [])];
}, { immediate: true });
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="modelValue" class="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 p-4" @click.self="closeModal">
      <div class="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl">
        <div class="flex items-start justify-between border-b border-slate-200 p-5">
          <div>
            <h3 class="text-lg font-bold text-slate-900">Editar datos logísticos del gasto</h3>
            <p class="mt-1 text-sm font-medium text-slate-600">ID {{ gastoId || '-' }}</p>
          </div>
          <button type="button" class="rounded-md p-2 text-2xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800" :disabled="saving" @click="closeModal">x</button>
        </div>

        <form class="overflow-y-auto p-5" @submit.prevent="saveGasto">
          <div v-if="loadingGasto" class="mb-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">Cargando datos del gasto...</div>
          <div v-if="errorMessage" class="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{{ errorMessage }}</div>
          <div v-if="proveedorFeedbackMessage" class="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{{ proveedorFeedbackMessage }}</div>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label class="form-label">Fecha gasto <span class="text-red-500">*</span></label>
              <input v-model="form.fecha_gasto" type="date" required class="form-input mt-1" />
            </div>
            <div>
              <label class="form-label">Monto total <span class="text-red-500">*</span></label>
              <input v-model="form.monto_total" type="number" min="0" step="0.01" required class="form-input mt-1" />
            </div>
            <div>
              <label class="form-label">Proveedor</label>
              <v-select
                v-model="form.proveedor_id"
                :options="proveedorOptions"
                :reduce="option => option.code"
                :loading="loadingOptions || creatingProveedor"
                placeholder="Seleccionar proveedor"
                class="v-select-filter bg-white"
                @search="(search) => { proveedorSearchText = search || ''; proveedorFeedbackMessage = ''; }"
              >
                <template #no-options>
                  <div class="space-y-2 py-1">
                    <p class="text-xs text-slate-500">Sin coincidencias.</p>
                    <button
                      v-if="canCreateProveedor"
                      type="button"
                      class="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                      @click="showCreateProveedorForm = true; newProveedorNombre = proveedorSearchText.trim(); proveedorFeedbackMessage = '';"
                    >
                      + Crear proveedor "{{ proveedorSearchText.trim() }}"
                    </button>
                  </div>
                </template>
              </v-select>
            </div>
            <div v-if="showCreateProveedorForm" class="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p class="mb-2 text-xs font-semibold text-slate-700">Crear proveedor</p>
              <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div class="md:col-span-2">
                  <label class="form-label">Nombre <span class="text-red-500">*</span></label>
                  <input v-model="newProveedorNombre" type="text" class="form-input mt-1" />
                </div>
                <div>
                  <label class="form-label">CUIT</label>
                  <input v-model="newProveedorCuit" type="text" class="form-input mt-1" />
                </div>
              </div>
              <div class="mt-3 flex justify-end gap-2">
                <button type="button" class="btn-secondary" :disabled="creatingProveedor" @click="resetCreateProveedorForm">Cancelar</button>
                <button type="button" class="btn-primary" :disabled="creatingProveedor" @click="createProveedorFromModal">
                  {{ creatingProveedor ? 'Creando...' : 'Crear proveedor' }}
                </button>
              </div>
            </div>
            <div>
              <label class="form-label">Transporte / operador logistico</label>
              <v-select v-model="form.transporte_id" :options="transportes" :reduce="option => option.code" :loading="loadingOptions" placeholder="Seleccionar transporte" class="v-select-filter bg-white" />
            </div>
            <div>
              <label class="form-label">Numero factura / guia / remito</label>
              <input v-model="form.numero_factura" type="text" class="form-input mt-1" />
            </div>
            <div>
              <label class="form-label">Paciente referido</label>
              <input v-model="form.paciente_referido" type="text" class="form-input mt-1" />
            </div>
            <div>
              <label class="form-label">Tipo de movimiento encomienda</label>
              <input v-model="form.tipo_movimiento_encomienda" type="text" class="form-input mt-1" />
            </div>
            <div>
              <label class="form-label">Numero de guia</label>
              <input v-model="form.numero_guia" type="text" class="form-input mt-1" />
            </div>
            <div class="md:col-span-2">
              <label class="form-label">Descripcion general</label>
              <textarea v-model="form.descripcion_general" rows="3" class="form-input mt-1"></textarea>
            </div>
          </div>

          <div v-if="gastoCompleto" class="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs font-semibold text-slate-600 md:grid-cols-4">
            <div><span class="block text-slate-400">Origen</span>{{ gastoCompleto.origen_gasto }}</div>
            <div><span class="block text-slate-400">Estado</span>{{ gastoCompleto.estado_delegacion }}</div>
            <div><span class="block text-slate-400">Rendicion</span>{{ gastoCompleto.viaje_id || '-' }}</div>
            <div><span class="block text-slate-400">Caja / Vehiculo</span>{{ gastoCompleto.caja_id || '-' }} / {{ gastoCompleto.vehiculo_id || '-' }}</div>
          </div>

          <div class="mt-6 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
            <button type="button" class="btn-secondary" :disabled="saving" @click="closeModal">Cancelar</button>
            <button type="submit" class="btn-primary" :disabled="saving || loadingGasto">{{ saving ? 'Guardando...' : 'Guardar cambios' }}</button>
          </div>
        </form>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.form-label { @apply block text-sm font-medium text-slate-700; }
.form-input { @apply block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm; }
.btn-primary { @apply rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50; }
.btn-secondary { @apply rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50; }
.v-select-filter { --vs-border-radius: 0.375rem; }
.z-60 { z-index: 60; }
.modal-fade-enter-active,
.modal-fade-leave-active { transition: opacity 0.2s ease; }
.modal-fade-enter-from,
.modal-fade-leave-to { opacity: 0; }
</style>
