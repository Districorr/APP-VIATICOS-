<script setup>
import { computed, ref, watch, reactive } from 'vue';
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

// Barra de carga masiva por lote (valores por defecto)
const showBulkBatchBar = ref(false);
const bulkBatch = reactive({
  fecha: defaultDate(),
  transporte_id: null,
  provincia_id: null,
  localidad_destino_id: null,
  proveedor_id: null,
});

let rowSequence = 0;

const createEmptyRow = (seed = {}) => {
  rowSequence += 1;
  const isCirugiaSeed = Number(seed.proveedor_id) === 14 || seed.es_cirugia || seed.tipo_logistica === 'cirugia';
  return {
    uid: `bulk-row-${rowSequence}`,
    fecha: seed.fecha || defaultDate(),
    cliente_id: seed.cliente_id || null,
    transporte_id: seed.transporte_id || null,
    provincia_id: seed.provincia_id || null,
    localidad_destino_id: seed.localidad_destino_id || null,
    destino_texto: seed.destino_texto || '',
    descripcion: seed.descripcion || '',
    proveedor_id: seed.proveedor_id || (isCirugiaSeed ? 14 : null),
    numero_guia: seed.numero_guia || '',
    paciente_referido: seed.paciente_referido || '',
    cantidad_bultos: seed.cantidad_bultos ?? 1,
    sentido_movimiento: seed.sentido_movimiento || 'ida',
    importe: seed.importe ?? '',
    observacion: seed.observacion || '',
    tipo_movimiento_encomienda: seed.tipo_movimiento_encomienda || 'Envío',
    tipo_logistica: isCirugiaSeed ? 'cirugia' : 'proveedor_otros',
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
    && !row.paciente_referido
    && !row.importe
    && !row.observacion;
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
  if (!row.paciente_referido?.trim() && (row.tipo_logistica === 'cirugia' || Number(row.proveedor_id) === 14)) {
    warnings.push('Sin paciente referido');
  }

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
    paciente_referido: row.paciente_referido,
    cantidad_bultos: row.cantidad_bultos,
    sentido_movimiento: row.sentido_movimiento,
    importe: row.importe,
    observacion: row.observacion,
    tipo_movimiento_encomienda: row.tipo_movimiento_encomienda,
    tipo_logistica: row.tipo_logistica,
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

async function handleBulkBatchProvinciaChange() {
  bulkBatch.localidad_destino_id = null;
  if (!bulkBatch.provincia_id) return;
  try {
    await ensureLocalidadesForProvincia(bulkBatch.provincia_id);
  } catch (e) {
    errorMessage.value = e.message || 'No se pudieron cargar las localidades del lote.';
  }
}

function applyBulkBatchToEmpty() {
  rows.value.forEach((row) => {
    if (bulkBatch.fecha && (!row.fecha || row.fecha === defaultDate())) row.fecha = bulkBatch.fecha;
    if (bulkBatch.transporte_id && !row.transporte_id) {
      row.transporte_id = bulkBatch.transporte_id;
      handleTransporteOrBultosChange(row);
    }
    if (bulkBatch.provincia_id && !row.provincia_id) {
      row.provincia_id = bulkBatch.provincia_id;
      ensureLocalidadesForProvincia(row.provincia_id);
    }
    if (bulkBatch.localidad_destino_id && !row.localidad_destino_id) row.localidad_destino_id = bulkBatch.localidad_destino_id;
    if (bulkBatch.proveedor_id && !row.proveedor_id) {
      row.proveedor_id = bulkBatch.proveedor_id;
      if (Number(row.proveedor_id) === 14) row.tipo_logistica = 'cirugia';
    }
  });
  emit('show-notification', 'Valores aplicados', 'Se aplicaron los valores por lote a las filas vacías.', 'success');
}

function applyBulkBatchToAll() {
  rows.value.forEach((row) => {
    if (bulkBatch.fecha) row.fecha = bulkBatch.fecha;
    if (bulkBatch.transporte_id) {
      row.transporte_id = bulkBatch.transporte_id;
      handleTransporteOrBultosChange(row);
    }
    if (bulkBatch.provincia_id) {
      row.provincia_id = bulkBatch.provincia_id;
      ensureLocalidadesForProvincia(row.provincia_id);
    }
    if (bulkBatch.localidad_destino_id) row.localidad_destino_id = bulkBatch.localidad_destino_id;
    if (bulkBatch.proveedor_id) {
      row.proveedor_id = bulkBatch.proveedor_id;
      if (Number(row.proveedor_id) === 14) row.tipo_logistica = 'cirugia';
    }
  });
  emit('show-notification', 'Valores aplicados', 'Se aplicaron los valores por lote a todas las filas.', 'success');
}

function obtenerTarifaBultoPorTransporte(transporteVal) {
  if (!transporteVal) return 0;
  let opt = transportesOptions.value.find(t => String(t.code || t.value || t.id) === String(transporteVal));
  if (opt && Number(opt.tarifa_por_bulto) > 0) {
    return Number(opt.tarifa_por_bulto);
  }
  const nombre = opt ? opt.label : String(transporteVal);
  const nameUpper = (nombre || '').toUpperCase();
  if (nameUpper.includes('LEDESMA')) return 30000;
  if (nameUpper.includes('DAMJA') || nameUpper.includes('ALAN')) return 20000;
  if (nameUpper.includes('MULLER') || nameUpper.includes('CLORINDA')) return 15000;
  return 0;
}

function handleTransporteOrBultosChange(row) {
  if (!row.transporte_id) return;
  const tarifa = obtenerTarifaBultoPorTransporte(row.transporte_id);
  if (tarifa > 0 && (!row.importe || Number(row.importe) === 0)) {
    const cant = Number(row.cantidad_bultos) || 1;
    row.importe = Math.round(cant * tarifa);
  }
}

// Analizador de descripción inteligente en tiempo real por fila
function handleDescripcionInput(row) {
  const text = (row.descripcion || '').trim();
  if (!text) return;
  const textUpper = text.toUpperCase();

  // 1. Detección de Cirugía
  if (textUpper.includes('CIRUGIA') || textUpper.includes('CIRUGÍA')) {
    row.tipo_logistica = 'cirugia';
    row.proveedor_id = 14;
  }

  // 2. Detección de Tipo de Movimiento
  if (textUpper.includes('DEVOLUCION') || textUpper.includes('DEVOLUCIÓN')) {
    row.tipo_movimiento_encomienda = 'Devolución';
  } else if (textUpper.includes('REPOSICION') || textUpper.includes('REPOSICIÓN') || textUpper.includes('STOCK')) {
    row.tipo_movimiento_encomienda = 'Reposición';
  } else if (textUpper.includes('RETIRO')) {
    row.tipo_movimiento_encomienda = 'Retiro';
  } else if (textUpper.includes('RECEPCION') || textUpper.includes('RECEPCIÓN')) {
    row.tipo_movimiento_encomienda = 'Recepción';
  } else if (textUpper.includes('ENVIO') || textUpper.includes('ENVÍO')) {
    row.tipo_movimiento_encomienda = 'Envío';
  }

  // 3. Detección de N° Guía / Factura / Remito
  const matchGuia = text.match(/(?:FAC(?:TURA)?|GU[IÍ]A|REMITO|RECIBO|N[°º])[:\s]*([A-Z0-9\-\.\/]{3,25})/i);
  if (matchGuia && matchGuia[1] && !row.numero_guia) {
    row.numero_guia = matchGuia[1].trim();
  }

  // 4. Detección de Paciente Referido ("PTE", "PACIENTE")
  const matchPaciente = text.match(/(?:PTE\.?|PACIENTE)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ\s]{3,30})/i);
  if (matchPaciente && matchPaciente[1] && !row.paciente_referido) {
    let rawPaciente = matchPaciente[1].split(/(?:IOSCOR|INSSSEP|SWISS|SANCOR|OSDE|PAMI|CIRUGIA|DEVOLUCION)/i)[0];
    row.paciente_referido = rawPaciente.trim();
  }

  // 5. Coincidencia con Clientes desde el Maestro
  if (clientesOptions.value && clientesOptions.value.length > 0 && !row.cliente_id) {
    const matchCli = clientesOptions.value.find(c => {
      const name = (c.label || '').toUpperCase();
      return name.length > 2 && textUpper.includes(name);
    });
    if (matchCli) {
      row.cliente_id = matchCli.code;
    }
  }

  // 6. Coincidencia con Proveedores desde el Maestro
  if (proveedoresOptions.value && proveedoresOptions.value.length > 0 && !row.proveedor_id && row.tipo_logistica !== 'cirugia') {
    const matchProv = proveedoresOptions.value.find(p => {
      const name = (p.label || '').toUpperCase();
      return name.length > 2 && textUpper.includes(name);
    });
    if (matchProv) {
      row.proveedor_id = matchProv.code;
    }
  }
}

async function handleCreateEntity(option, tableName, row) {
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const label = (option.label || '').trim();
    if (!label) return;

    let rpcName = 'crear_entidad_al_vuelo';
    let params = { p_nombre_entidad: label, p_nombre_tabla: tableName };

    if (tableName === 'localidades') {
      if (!row.provincia_id) {
        throw new Error('Debe seleccionar una provincia antes de crear una localidad.');
      }
      rpcName = 'crear_localidad_al_vuelo';
      params = { p_nombre_localidad: label, p_provincia_id: row.provincia_id };
    }

    const { data, error } = await supabase.rpc(rpcName, params);
    if (error) throw error;

    const newId = Number(data);

    if (tableName === 'clientes') {
      clientesOptions.value = [...clientesOptions.value.filter(o => o.code !== option.code), { label, code: newId }];
      row.cliente_id = newId;
    } else if (tableName === 'transportes') {
      transportesOptions.value = [...transportesOptions.value.filter(o => o.code !== option.code), { label, code: newId }];
      row.transporte_id = newId;
    } else if (tableName === 'proveedores') {
      proveedoresOptions.value = [...proveedoresOptions.value.filter(o => o.code !== option.code), { label, code: newId }];
      row.proveedor_id = newId;
    } else if (tableName === 'localidades') {
      const provinciaKey = String(row.provincia_id);
      const currentLocs = localidadesCache.value[provinciaKey] || [];
      localidadesCache.value = {
        ...localidadesCache.value,
        [provinciaKey]: [...currentLocs.filter(o => o.code !== option.code), { label, code: newId }]
      };
      row.localidad_destino_id = newId;
    }

    emit('show-notification', 'Creado con éxito', `Se creó "${label}" correctamente.`, 'success');
  } catch (e) {
    if (tableName === 'clientes') row.cliente_id = null;
    else if (tableName === 'transportes') row.transporte_id = null;
    else if (tableName === 'proveedores') row.proveedor_id = null;
    else if (tableName === 'localidades') row.localidad_destino_id = null;

    errorMessage.value = `Error al crear: ${e.message || 'Error desconocido'}`;
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
      supabase.from('transportes').select('id, nombre, tarifa_por_bulto').order('nombre'),
      supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('provincias').select('id, nombre').order('nombre'),
    ]);

    if (clientesRes.error) throw clientesRes.error;
    if (transportesRes.error) throw transportesRes.error;
    if (proveedoresRes.error) throw proveedoresRes.error;
    if (provinciasRes.error) throw provinciasRes.error;

    clientesOptions.value = (clientesRes.data || []).map((item) => ({ code: item.id, label: item.nombre_cliente }));
    transportesOptions.value = (transportesRes.data || []).map((item) => ({ code: item.id, label: item.nombre, tarifa_por_bulto: item.tarifa_por_bulto }));

    const provs = (proveedoresRes.data || []).map((item) => ({ code: item.id, label: item.nombre }));
    if (!provs.some(p => Number(p.code) === 14)) {
      provs.unshift({ code: 14, label: 'LOGISTICA CIRUGIA' });
    }
    proveedoresOptions.value = provs;

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
    const payload = validRows.value.map(({ row }) => {
      const isCirugia = Number(row.proveedor_id) === 14 || row.tipo_logistica === 'cirugia';
      return {
        fecha_gasto: row.fecha ? `${row.fecha}T12:00:00Z` : null,
        descripcion_general: row.descripcion?.trim() || null,
        monto_total: Number(row.importe),
        cliente_id: row.cliente_id || null,
        transporte_id: row.transporte_id || null,
        proveedor_id: isCirugia ? 14 : (row.proveedor_id || null),
        provincia_id: row.provincia_id || null,
        localidad_destino_id: row.localidad_destino_id || null,
        numero_guia: row.numero_guia?.trim() || null,
        paciente_referido: row.paciente_referido?.trim() || null,
        destino_texto: row.destino_texto?.trim() || null,
        tipo_movimiento_encomienda: row.tipo_movimiento_encomienda?.trim() || 'Envío',
        observacion_logistica: row.observacion?.trim() || null,
        encomienda_id: row.encomienda_id || null,
        origen_carga: 'encomiendas_carga_multiple',
        modulo: 'logistica',
        tipo_logistica: isCirugia ? 'cirugia' : 'proveedor_otros',
        cantidad_bultos: Number(row.cantidad_bultos) || 1,
        sentido_movimiento: row.sentido_movimiento || 'ida',
        tipo_gasto_id: 22,
      };
    });

    console.log('PAYLOAD BATCH', payload);

    const { data, error } = await supabase.rpc('crear_pagos_encomiendas_batch', {
      p_pagos: payload,
    });

    console.log('RPC RESULT', data);
    if (error) {
      console.error('RPC ERROR', error);
      throw error;
    }

    if (data && typeof data === 'object' && data.ok === false) {
      const msgs = (data.errores || []).map((e) => e.mensaje).join(', ');
      throw new Error(msgs || 'Error al registrar los pagos.');
    }

    const insertedIds = Array.isArray(data)
      ? data.map(item => item.id).filter(Boolean)
      : (data && data.ids ? data.ids : []);

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
    <div v-if="modelValue" class="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 p-2 md:p-4 overflow-y-auto">
      <div class="flex h-[96vh] w-[calc(100vw-1rem)] max-w-[1680px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl md:w-[calc(100vw-2rem)] my-auto" @click.stop>
        <!-- Encabezado del Modal -->
        <div class="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-xl font-bold text-slate-900">Cargar pagos de encomiendas</h3>
              <span class="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">Carga Masiva v2</span>
            </div>
            <p class="mt-1 text-sm font-medium text-slate-600">Carga rápida tipo planilla con autocompletado e imputación a cuenta corriente empresa.</p>
          </div>
          <button type="button" class="rounded-md p-2 text-2xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800" :disabled="saving" @click="closeModal">×</button>
        </div>

        <!-- Tarjetas de Resumen & Acciones -->
        <div class="border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div class="grid flex-1 grid-cols-2 gap-3 md:grid-cols-4">
              <div class="summary-card"><span>Filas</span><strong>{{ summary.rows }}</strong></div>
              <div class="summary-card"><span>Pagos válidos</span><strong class="text-emerald-600">{{ summary.valid }}</strong></div>
              <div class="summary-card"><span>Filas con observaciones</span><strong :class="summary.invalid > 0 ? 'text-amber-600' : 'text-slate-700'">{{ summary.invalid }}</strong></div>
              <div class="summary-card"><span>Total a registrar</span><strong class="text-indigo-600">{{ formatCurrency(summary.total) }}</strong></div>
            </div>
            <button
              type="button"
              class="flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100"
              @click="showBulkBatchBar = !showBulkBatchBar"
            >
              <span>⚡ {{ showBulkBatchBar ? 'Ocultar valores por lote' : 'Carga rápida por lote' }}</span>
            </button>
          </div>

          <!-- Barra Desplegable de Valores Masivos por Lote -->
          <Transition name="modal-fade">
            <div v-if="showBulkBatchBar" class="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
              <div class="mb-3 text-xs font-bold uppercase tracking-wider text-indigo-900">Aplicar valores predeterminados a múltiples filas</div>
              <div class="grid grid-cols-1 gap-3 md:grid-cols-5">
                <div>
                  <span class="field-label">Fecha por lote</span>
                  <input v-model="bulkBatch.fecha" type="date" class="form-input mt-1" />
                </div>
                <div>
                  <span class="field-label">Transporte por lote</span>
                  <v-select
                    v-model="bulkBatch.transporte_id"
                    :options="transportesOptions"
                    :reduce="option => option.code"
                    placeholder="Transporte"
                    class="v-select-filter mt-1 bg-white"
                  />
                </div>
                <div>
                  <span class="field-label">Provincia por lote</span>
                  <v-select
                    v-model="bulkBatch.provincia_id"
                    :options="provinciasOptions"
                    :reduce="option => option.code"
                    placeholder="Provincia"
                    class="v-select-filter mt-1 bg-white"
                    @update:modelValue="handleBulkBatchProvinciaChange"
                  />
                </div>
                <div>
                  <span class="field-label">Localidad por lote</span>
                  <v-select
                    v-model="bulkBatch.localidad_destino_id"
                    :options="getLocalidadOptions(bulkBatch.provincia_id)"
                    :reduce="option => option.code"
                    :disabled="!bulkBatch.provincia_id"
                    placeholder="Localidad"
                    class="v-select-filter mt-1 bg-white"
                  />
                </div>
                <div>
                  <span class="field-label">Proveedor por lote</span>
                  <v-select
                    v-model="bulkBatch.proveedor_id"
                    :options="proveedoresOptions"
                    :reduce="option => option.code"
                    placeholder="Proveedor"
                    class="v-select-filter mt-1 bg-white"
                  />
                </div>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <button type="button" class="btn-secondary text-xs" @click="applyBulkBatchToEmpty">Aplicar a filas vacías</button>
                <button type="button" class="btn-primary text-xs" @click="applyBulkBatchToAll">Aplicar a TODAS las filas</button>
              </div>
            </div>
          </Transition>
        </div>

        <!-- Cuerpo con Listado de Filas -->
        <div class="overflow-y-auto px-4 py-5 md:px-6">
          <div v-if="errorMessage" class="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{{ errorMessage }}</div>
          <div v-if="successMessage" class="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{{ successMessage }}</div>

          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div class="flex gap-2">
              <button type="button" class="btn-secondary" @click="addRow">+ Agregar fila</button>
              <button type="button" class="btn-secondary" @click="resetRows">Limpiar todo</button>
            </div>
            <button type="button" class="btn-primary" :disabled="saving || loadingOptions" @click="saveRows">{{ saving ? 'Guardando...' : 'Guardar pagos' }}</button>
          </div>

          <div class="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-3 md:p-4">
            <div
              v-for="(entry, index) in rowStates"
              :key="entry.row.uid"
              class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <!-- Cabecera de Fila -->
              <div class="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-3 xl:flex-row xl:items-center xl:justify-between">
                <div class="flex items-center gap-3">
                  <span class="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{{ index + 1 }}</span>
                  <div>
                    <div class="text-sm font-bold text-slate-900">Fila {{ index + 1 }}</div>
                    <div class="text-[11px] font-medium text-slate-500">Carga individual de pago / encomienda</div>
                  </div>
                  <span
                    v-if="entry.row.tipo_logistica === 'cirugia' || Number(entry.row.proveedor_id) === 14"
                    class="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800"
                  >
                    🏥 LOGÍSTICA DE CIRUGÍA
                  </span>
                </div>
                <div class="flex flex-wrap gap-2 xl:justify-end">
                  <button type="button" class="row-action" @click="duplicateRow(index)">Duplicar</button>
                  <button type="button" class="row-action" @click="clearRow(index)">Limpiar</button>
                  <button type="button" class="row-action danger" @click="removeRow(index)">Quitar</button>
                </div>
              </div>

              <!-- Rejilla Formulario de Fila -->
              <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
                <!-- Bloque 1: Fecha & Transporte -->
                <label class="field-group">
                  <span class="field-label">Fecha</span>
                  <input v-model="entry.row.fecha" type="date" class="form-input" />
                </label>

                <label class="field-group">
                  <span class="field-label">Transporte <span class="text-red-500">*</span></span>
                  <v-select
                    v-model="entry.row.transporte_id"
                    :options="transportesOptions"
                    :reduce="option => option.code"
                    :loading="loadingOptions"
                    taggable
                    :create-option="option => ({ label: option, code: option })"
                    @option:created="(option) => handleCreateEntity(option, 'transportes', entry.row)"
                    @update:modelValue="() => handleTransporteOrBultosChange(entry.row)"
                    placeholder="Seleccionar transporte"
                    class="v-select-filter"
                  />
                </label>

                <label class="field-group">
                  <span class="field-label">Provincia</span>
                  <v-select
                    v-model="entry.row.provincia_id"
                    :options="provinciasOptions"
                    :reduce="option => option.code"
                    :loading="loadingOptions"
                    placeholder="Provincia"
                    class="v-select-filter"
                    @update:modelValue="() => handleProvinciaChange(entry.row)"
                  />
                </label>

                <label class="field-group">
                  <span class="field-label">Localidad destino</span>
                  <v-select
                    v-model="entry.row.localidad_destino_id"
                    :options="getLocalidadOptions(entry.row.provincia_id)"
                    :reduce="option => option.code"
                    :loading="loadingOptions"
                    :disabled="!entry.row.provincia_id"
                    taggable
                    :create-option="option => ({ label: option, code: option })"
                    @option:created="(option) => handleCreateEntity(option, 'localidades', entry.row)"
                    placeholder="Localidad"
                    class="v-select-filter"
                  />
                </label>

                <label class="field-group">
                  <span class="field-label">Destino (Texto)</span>
                  <input v-model="entry.row.destino_texto" type="text" class="form-input" placeholder="Ej: Resistencia / Clínica" />
                </label>

                <label class="field-group md:col-span-2 lg:col-span-3 xl:col-span-1 2xl:col-span-1">
                  <span class="field-label">Cliente</span>
                  <v-select
                    v-model="entry.row.cliente_id"
                    :options="clientesOptions"
                    :reduce="option => option.code"
                    :loading="loadingOptions"
                    taggable
                    :create-option="option => ({ label: option, code: option })"
                    @option:created="(option) => handleCreateEntity(option, 'clientes', entry.row)"
                    placeholder="Cliente"
                    class="v-select-filter"
                  />
                </label>

                <!-- Bloque 2: Descripción General con Parser Inteligente -->
                <div class="field-group md:col-span-2 lg:col-span-3 xl:col-span-2 2xl:col-span-3">
                  <span class="field-label">Descripción General <span class="text-red-500">*</span></span>
                  <input
                    v-model="entry.row.descripcion"
                    type="text"
                    class="form-input"
                    placeholder="Ej: ENVIO CIRUGIA PTE PEREZ GUIA 4589"
                    @input="handleDescripcionInput(entry.row)"
                  />
                  <div class="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    <span class="font-medium text-slate-400">💡 Tip: Escribe "CIRUGIA", "PTE [Nombre]", "GUIA [N°]" para autocompletar.</span>
                  </div>
                </div>

                <!-- Bloque 3: Paciente Referido & Proveedor -->
                <label class="field-group md:col-span-1 2xl:col-span-1">
                  <span class="field-label">Paciente Referido</span>
                  <input v-model="entry.row.paciente_referido" type="text" class="form-input" placeholder="Paciente" />
                </label>

                <div class="field-group md:col-span-1 2xl:col-span-2">
                  <span class="field-label">Proveedor</span>
                  <v-select
                    v-model="entry.row.proveedor_id"
                    :options="proveedoresOptions"
                    :reduce="option => option.code"
                    :loading="loadingOptions"
                    taggable
                    :create-option="option => ({ label: option, code: option })"
                    @option:created="(option) => handleCreateEntity(option, 'proveedores', entry.row)"
                    placeholder="Proveedor"
                    class="v-select-filter"
                  />
                  <div class="mt-1 flex items-center">
                    <input
                      :id="'es_cirugia_bulk_' + index"
                      type="checkbox"
                      :checked="entry.row.proveedor_id === 14 || entry.row.tipo_logistica === 'cirugia'"
                      @change="(e) => {
                        if (e.target.checked) {
                          entry.row.proveedor_id = 14;
                          entry.row.tipo_logistica = 'cirugia';
                        } else {
                          entry.row.tipo_logistica = 'proveedor_otros';
                          if (entry.row.proveedor_id === 14) entry.row.proveedor_id = null;
                        }
                      }"
                      class="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label :for="'es_cirugia_bulk_' + index" class="ml-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">
                      Es Logística de Cirugía
                    </label>
                  </div>
                </div>

                <!-- Bloque 4: Guía, Bultos, Movimiento e Importe -->
                <label class="field-group">
                  <span class="field-label">N° Guía</span>
                  <input v-model="entry.row.numero_guia" type="text" class="form-input" placeholder="N° guía / factura" />
                </label>

                <label class="field-group">
                  <span class="field-label">Cant. Bultos</span>
                  <input
                    v-model.number="entry.row.cantidad_bultos"
                    type="number"
                    min="1"
                    class="form-input"
                    @input="() => handleTransporteOrBultosChange(entry.row)"
                  />
                </label>

                <label class="field-group">
                  <span class="field-label">Movimiento</span>
                  <select v-model="entry.row.tipo_movimiento_encomienda" class="form-input">
                    <option value="Envío">Envío</option>
                    <option value="Recepción">Recepción</option>
                    <option value="Retiro">Retiro</option>
                    <option value="Devolución">Devolución</option>
                    <option value="Reposición">Reposición</option>
                  </select>
                </label>

                <label class="field-group">
                  <span class="field-label">Importe ($) <span class="text-red-500">*</span></span>
                  <input v-model="entry.row.importe" type="number" min="0" step="0.01" class="form-input font-semibold text-slate-900" placeholder="0,00" />
                </label>

                <!-- Bloque 5: Observación -->
                <label class="field-group md:col-span-2 lg:col-span-3 xl:col-span-4 2xl:col-span-2">
                  <span class="field-label">Observación</span>
                  <input v-model="entry.row.observacion" type="text" class="form-input" placeholder="Observación opcional" />
                </label>
              </div>

              <!-- Banner de Validación de Fila -->
              <div
                class="mt-3 rounded-xl border px-3 py-2 text-xs font-semibold"
                :class="entry.validation.errors.length ? 'border-red-200 bg-red-50 text-red-700' : entry.validation.warnings.length ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'"
              >
                <template v-if="entry.validation.errors.length">
                  ❌ {{ entry.validation.errors.join(' • ') }}
                </template>
                <template v-else-if="entry.validation.warnings.length">
                  ⚠️ Listo para guardar — {{ entry.validation.warnings.join(' • ') }}
                </template>
                <template v-else>
                  ✓ Listo para guardar
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- Pie de Modal -->
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
