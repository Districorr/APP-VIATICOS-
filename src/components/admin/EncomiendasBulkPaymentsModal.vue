<script setup>
import { computed, ref, watch } from 'vue';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';

import { supabase } from '../../supabaseClient';
import { formatCurrency } from '../../utils/formatters';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  seedPayment: { type: Object, default: null },
});

const emit = defineEmits(['update:modelValue', 'saved', 'show-notification']);

const loadingOptions = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const rows = ref([]);
const clientesOptions = ref([]);
const transportesOptions = ref([]);
const proveedoresOptions = ref([]);
const provinciasOptions = ref([]);
const localidadesCache = ref({});
const defaultDate = () => new Date().toISOString().split('T')[0];

let rowSequence = 0;

const createEmptyRow = (seed = {}) => {
  rowSequence += 1;
  return {
    uid: `bulk-row-${rowSequence}`,
    fecha: seed.fecha || defaultDate(),
    cliente_id: seed.cliente_id || null,
    transporte_id: seed.transporte_id || null,
    provincia_id: seed.provincia_id || null,
    localidad_destino_id: seed.localidad_destino_id || null,
    destino_texto: seed.destino_texto || '',
    descripcion: seed.descripcion || '',
    proveedor_id: seed.proveedor_id || null,
    numero_guia: seed.numero_guia || '',
    importe: seed.importe ?? '',
    observacion: seed.observacion || '',
    tipo_movimiento_encomienda: seed.tipo_movimiento_encomienda || '',
    encomienda_id: seed.encomienda_id || null,
  };
};

const isRowEmpty = (row) => {
  return (!row.fecha || row.fecha === defaultDate())
    && !row.cliente_id
    && !row.transporte_id
    && !row.provincia_id
    && !row.localidad_destino_id
    && !row.destino_texto
    && !row.descripcion
    && !row.proveedor_id
    && !row.numero_guia
    && !row.importe
    && !row.observacion
    && !row.tipo_movimiento_encomienda;
};

const getRowValidation = (row) => {
  const errors = [];
  const warnings = [];
  const importe = Number(row.importe);

  if (!row.fecha) errors.push('Fecha obligatoria');
  if (!row.transporte_id) errors.push('Transporte obligatorio');
  if (!row.descripcion?.trim()) errors.push('Descripcion obligatoria');
  if (!Number.isFinite(importe) || importe <= 0) errors.push('Importe mayor a 0');

  if (!row.cliente_id) warnings.push('Sin cliente');
  if (!row.destino_texto?.trim() && !row.provincia_id) warnings.push('Sin destino');
  if (!row.proveedor_id) warnings.push('Sin proveedor');
  if (!row.numero_guia?.trim()) warnings.push('Sin N° guia');

  return {
    errors,
    warnings,
    isValid: errors.length === 0,
    amount: Number.isFinite(importe) ? importe : 0,
  };
};

const rowStates = computed(() => rows.value.map((row) => ({ row, validation: getRowValidation(row) })));
const validRows = computed(() => rowStates.value.filter((item) => item.validation.isValid));
const invalidRows = computed(() => rowStates.value.filter((item) => !item.validation.isValid));
const totalAmount = computed(() => validRows.value.reduce((total, item) => total + item.validation.amount, 0));

const summary = computed(() => ({
  rows: rows.value.length,
  valid: validRows.value.length,
  invalid: invalidRows.value.length,
  total: totalAmount.value,
}));

function resetRows() {
  rows.value = [createEmptyRow(props.seedPayment || undefined)];
  errorMessage.value = '';
  successMessage.value = '';
}

function closeModal() {
  if (saving.value) return;
  emit('update:modelValue', false);
}

function addRow(seed = null) {
  rows.value.push(createEmptyRow(seed || undefined));
}

function duplicateRow(index) {
  const row = rows.value[index];
  if (!row) return;
  addRow({
    fecha: row.fecha || defaultDate(),
    cliente_id: row.cliente_id,
    transporte_id: row.transporte_id,
    provincia_id: row.provincia_id,
    localidad_destino_id: row.localidad_destino_id,
    destino_texto: row.destino_texto,
    descripcion: row.descripcion,
    proveedor_id: row.proveedor_id,
    numero_guia: row.numero_guia,
    importe: row.importe,
    observacion: row.observacion,
    tipo_movimiento_encomienda: row.tipo_movimiento_encomienda,
    encomienda_id: row.encomienda_id,
  });
}

function clearRow(index) {
  const current = rows.value[index];
  if (!current) return;
  rows.value[index] = createEmptyRow();
}

function removeRow(index) {
  const current = rows.value[index];
  if (!current) return;
  if (!isRowEmpty(current) && !window.confirm('La fila tiene datos cargados. Queres eliminarla igualmente?')) return;
  rows.value.splice(index, 1);
  if (rows.value.length === 0) addRow();
}

async function ensureLocalidadesForProvincia(provinciaId) {
  const key = String(provinciaId || '');
  if (!key) return [];
  if (localidadesCache.value[key]) return localidadesCache.value[key];

  const { data, error } = await supabase
    .from('localidades')
    .select('id, nombre')
    .eq('provincia_id', provinciaId)
    .order('nombre');

  if (error) throw error;

  const options = (data || []).map((item) => ({ code: item.id, label: item.nombre }));
  localidadesCache.value = { ...localidadesCache.value, [key]: options };
  return options;
}

function getLocalidadOptions(provinciaId) {
  return localidadesCache.value[String(provinciaId || '')] || [];
}

async function handleProvinciaChange(row) {
  row.localidad_destino_id = null;
  if (!row.provincia_id) return;
  try {
    await ensureLocalidadesForProvincia(row.provincia_id);
  } catch (e) {
    errorMessage.value = e.message || 'No se pudieron cargar las localidades.';
  }
}

async function loadOptions() {
  loadingOptions.value = true;
  try {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) throw new Error('Usuario no autenticado.');

    const [clientesRes, transportesRes, proveedoresRes, provinciasRes] = await Promise.all([
      supabase.from('clientes').select('id, nombre_cliente').order('nombre_cliente'),
      supabase.from('transportes').select('id, nombre').order('nombre'),
      supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('provincias').select('id, nombre').order('nombre'),
    ]);

    if (clientesRes.error) throw clientesRes.error;
    if (transportesRes.error) throw transportesRes.error;
    if (proveedoresRes.error) throw proveedoresRes.error;
    if (provinciasRes.error) throw provinciasRes.error;

    clientesOptions.value = (clientesRes.data || []).map((item) => ({ code: item.id, label: item.nombre_cliente }));
    transportesOptions.value = (transportesRes.data || []).map((item) => ({ code: item.id, label: item.nombre }));
    proveedoresOptions.value = (proveedoresRes.data || []).map((item) => ({ code: item.id, label: item.nombre }));
    provinciasOptions.value = (provinciasRes.data || []).map((item) => ({ code: item.id, label: item.nombre }));
  } catch (e) {
    errorMessage.value = e.message || 'No se pudieron cargar las opciones del modal.';
  } finally {
    loadingOptions.value = false;
  }
}

async function saveRows() {
  errorMessage.value = '';
  successMessage.value = '';

  if (saving.value) return;
  if (validRows.value.length === 0) {
    errorMessage.value = 'No hay filas validas para guardar.';
    return;
  }

  saving.value = true;
  try {
    const payload = validRows.value.map(({ row }) => ({
      fecha_gasto: row.fecha ? `${row.fecha}T12:00:00Z` : null,
      descripcion_general: row.descripcion?.trim() || null,
      monto_total: Number(row.importe),
      cliente_id: row.cliente_id || null,
      transporte_id: row.transporte_id || null,
      proveedor_id: row.proveedor_id || null,
      provincia_id: row.provincia_id || null,
      localidad_destino_id: row.localidad_destino_id || null,
      numero_guia: row.numero_guia?.trim() || null,
      destino_texto: row.destino_texto?.trim() || null,
      tipo_movimiento_encomienda: row.tipo_movimiento_encomienda?.trim() || null,
      observacion_logistica: row.observacion?.trim() || null,
      encomienda_id: row.encomienda_id || null,
    }));

    const { data, error } = await supabase.rpc('crear_pagos_encomiendas_batch', {
      p_pagos: payload,
    });
    if (error) throw error;

    // Verificar si la respuesta del RPC indica error interno (ej: problemas de permisos)
    if (data && typeof data === 'object' && data.ok === false) {
      const msgs = (data.errores || []).map((e) => e.mensaje).join(', ');
      throw new Error(msgs || 'Error al registrar los pagos.');
    }

    // Obtener los IDs insertados para asignarle tipo_gasto_id = 22 (Logística : Envíos | Devoluciones)
    // Esto es crítico porque el RPC los crea con tipo_gasto_id null, lo que hace que no se filtren en la tabla de analíticas
    const insertedIds = Array.isArray(data)
      ? data.map(item => item.id).filter(Boolean)
      : (data && data.ids ? data.ids : []);

    if (insertedIds.length > 0) {
      const { error: updateError } = await supabase
        .from('gastos')
        .update({ tipo_gasto_id: 22 })
        .in('id', insertedIds);
      if (updateError) throw updateError;
    }

    const count = insertedIds.length || payload.length;
    successMessage.value = `${count} pago(s) registrados correctamente.`;
    emit('saved', { count });
    emit('show-notification', 'Pagos registrados', `${count} pago(s) registrados en cuenta corriente empresa.`, 'success');
    setTimeout(() => {
      emit('update:modelValue', false);
    }, 600);
  } catch (e) {
    errorMessage.value = e.message || 'No se pudieron registrar los pagos.';
  } finally {
    saving.value = false;
  }
}

watch(() => props.modelValue, async (isOpen) => {
  if (!isOpen) return;
  resetRows();
  await loadOptions();
  await Promise.all(rows.value.map((row) => (row.provincia_id ? ensureLocalidadesForProvincia(row.provincia_id) : Promise.resolve())));
});

watch(() => props.seedPayment, (seed) => {
  if (!props.modelValue || !seed) return;
  resetRows();
});
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="modelValue" class="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 p-2 md:p-4" @click.self="closeModal">
      <div class="flex h-[96vh] w-[calc(100vw-1rem)] max-w-[1680px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl md:w-[calc(100vw-2rem)]">
        <div class="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <h3 class="text-xl font-bold text-slate-900">Cargar pagos de encomiendas</h3>
            <p class="mt-1 text-sm font-medium text-slate-600">Carga rapida tipo planilla para registrar pagos en cuenta corriente empresa.</p>
          </div>
          <button type="button" class="rounded-md p-2 text-2xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800" :disabled="saving" @click="closeModal">x</button>
        </div>

        <div class="border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div class="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div class="summary-card"><span>Filas</span><strong>{{ summary.rows }}</strong></div>
            <div class="summary-card"><span>Pagos validos</span><strong>{{ summary.valid }}</strong></div>
            <div class="summary-card"><span>Filas con errores</span><strong>{{ summary.invalid }}</strong></div>
            <div class="summary-card md:col-span-2"><span>Total a registrar</span><strong>{{ formatCurrency(summary.total) }}</strong></div>
          </div>
        </div>

        <div class="overflow-y-auto px-4 py-5 md:px-6">
          <div v-if="errorMessage" class="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{{ errorMessage }}</div>
          <div v-if="successMessage" class="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{{ successMessage }}</div>

          <div class="mb-4 flex flex-wrap gap-3">
            <button type="button" class="btn-secondary" @click="addRow">+ Agregar fila</button>
            <button type="button" class="btn-primary" :disabled="saving || loadingOptions" @click="saveRows">{{ saving ? 'Guardando...' : 'Guardar pagos' }}</button>
          </div>

          <div class="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-3 md:p-4">
            <div
              v-for="(entry, index) in rowStates"
              :key="entry.row.uid"
              class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div class="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div class="text-sm font-bold text-slate-900">Fila {{ index + 1 }}</div>
                  <div class="mt-1 text-xs font-medium text-slate-500">Carga individual para pago de encomienda</div>
                </div>
                <div class="flex flex-wrap gap-2 xl:justify-end">
                  <button type="button" class="row-action" @click="duplicateRow(index)">Duplicar</button>
                  <button type="button" class="row-action" @click="clearRow(index)">Limpiar</button>
                  <button type="button" class="row-action danger" @click="removeRow(index)">Quitar</button>
                </div>
              </div>

              <div class="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
                <label class="field-group">
                  <span class="field-label">Fecha</span>
                  <input v-model="entry.row.fecha" type="date" class="form-input" />
                </label>

                <label class="field-group">
                  <span class="field-label">Cliente</span>
                  <v-select v-model="entry.row.cliente_id" :options="clientesOptions" :reduce="option => option.code" :loading="loadingOptions" placeholder="Cliente" class="v-select-filter" />
                </label>

                <label class="field-group">
                  <span class="field-label">Transporte</span>
                  <v-select v-model="entry.row.transporte_id" :options="transportesOptions" :reduce="option => option.code" :loading="loadingOptions" placeholder="Transporte" class="v-select-filter" />
                </label>

                <label class="field-group">
                  <span class="field-label">Provincia</span>
                  <v-select v-model="entry.row.provincia_id" :options="provinciasOptions" :reduce="option => option.code" :loading="loadingOptions" placeholder="Provincia" class="v-select-filter" @update:modelValue="() => handleProvinciaChange(entry.row)" />
                </label>

                <label class="field-group">
                  <span class="field-label">Localidad destino</span>
                  <v-select v-model="entry.row.localidad_destino_id" :options="getLocalidadOptions(entry.row.provincia_id)" :reduce="option => option.code" :loading="loadingOptions" :disabled="!entry.row.provincia_id" placeholder="Localidad" class="v-select-filter" />
                </label>

                <label class="field-group">
                  <span class="field-label">Destino</span>
                  <input v-model="entry.row.destino_texto" type="text" class="form-input" placeholder="Localidad / destino" />
                </label>

                <label class="field-group md:col-span-2">
                  <span class="field-label">Descripcion</span>
                  <input v-model="entry.row.descripcion" type="text" class="form-input" placeholder="Pago de encomienda" />
                </label>

                <label class="field-group">
                  <span class="field-label">Proveedor</span>
                  <v-select v-model="entry.row.proveedor_id" :options="proveedoresOptions" :reduce="option => option.code" :loading="loadingOptions" placeholder="Proveedor" class="v-select-filter" />
                </label>

                <label class="field-group">
                  <span class="field-label">N° guia</span>
                  <input v-model="entry.row.numero_guia" type="text" class="form-input" placeholder="N° guia" />
                </label>

                <label class="field-group">
                  <span class="field-label">Importe</span>
                  <input v-model="entry.row.importe" type="number" min="0" step="0.01" class="form-input" placeholder="0,00" />
                </label>

                <label class="field-group">
                  <span class="field-label">Movimiento</span>
                  <select v-model="entry.row.tipo_movimiento_encomienda" class="form-input">
                    <option value="">Sin especificar</option>
                    <option value="Envio">Envio</option>
                    <option value="Recepcion">Recepcion</option>
                    <option value="Retiro">Retiro</option>
                  </select>
                </label>

                <label class="field-group md:col-span-2 2xl:col-span-4">
                  <span class="field-label">Observacion</span>
                  <input v-model="entry.row.observacion" type="text" class="form-input" placeholder="Observacion opcional" />
                </label>
              </div>

              <div
                class="mt-4 rounded-xl border px-3 py-2 text-sm font-semibold"
                :class="entry.validation.errors.length ? 'border-red-200 bg-red-50 text-red-700' : entry.validation.warnings.length ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'"
              >
                <template v-if="entry.validation.errors.length">
                  {{ entry.validation.errors.join(' • ') }}
                </template>
                <template v-else-if="entry.validation.warnings.length">
                  {{ entry.validation.warnings.join(' • ') }}
                </template>
                <template v-else>
                  Lista para guardar
                </template>
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white px-6 py-4 sm:flex-row sm:justify-end">
          <button type="button" class="btn-secondary" :disabled="saving" @click="closeModal">Cancelar</button>
          <button type="button" class="btn-primary" :disabled="saving || loadingOptions" @click="saveRows">{{ saving ? 'Guardando...' : 'Guardar pagos' }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.form-input { @apply block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm; }
.btn-primary { @apply rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50; }
.btn-secondary { @apply rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50; }
.summary-card { @apply rounded-lg border border-slate-200 bg-white px-4 py-3; }
.summary-card span { @apply block text-xs font-bold uppercase tracking-wide text-slate-500; }
.summary-card strong { @apply mt-1 block text-xl font-bold text-slate-900; }
.field-group { @apply flex flex-col gap-1.5; }
.field-label { @apply text-xs font-bold uppercase tracking-wide text-slate-500; }
.row-action { @apply rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50; }
.row-action.danger { @apply border-red-200 text-red-700 hover:bg-red-50; }
.v-select-filter { --vs-border-radius: 0.375rem; }
.z-60 { z-index: 60; }
.modal-fade-enter-active,
.modal-fade-leave-active { transition: opacity 0.2s ease; }
.modal-fade-enter-from,
.modal-fade-leave-to { opacity: 0; }
</style>
