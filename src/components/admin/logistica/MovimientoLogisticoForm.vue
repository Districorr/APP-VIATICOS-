<script setup>
import { ref, reactive, watch, computed, onMounted, onUnmounted } from 'vue';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';
import { supabase } from '../../../supabaseClient.js';
import { useLogisticaDescriptionParser } from '../../../composables/useLogisticaDescriptionParser.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  mode: { type: String, default: 'standalone' }, // 'standalone' | 'embedded'
  isEmbedded: { type: Boolean, default: false },
  initialData: { type: Object, default: () => ({}) },
});

const emit = defineEmits(['update:modelValue', 'saved', 'cancelar', 'show-notification']);

const isEmbeddedMode = computed(() => props.mode === 'embedded' || props.isEmbedded);

const saving = ref(false);
const loadingOptions = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const clientesOptions = ref([]);
const transportesOptions = ref([]);
const proveedoresOptions = ref([]);
const provinciasOptions = ref([]);
const localidadesCache = ref({});
const tiposGastoOptions = ref([]);

const defaultDate = () => new Date().toISOString().split('T')[0];

const formState = reactive({
  tipo_logistica: 'cirugia',
  fecha_gasto: defaultDate(),
  transporte_id: null,
  provincia_id: null,
  localidad_destino_id: null,
  destino_texto: '',
  cliente_id: null,
  paciente_referido: '',
  proveedor_id: null,
  cantidad_bultos: 1,
  sentido_movimiento: 'ida',
  tipo_movimiento_encomienda: 'Envío',
  descripcion_general: '',
  monto_total: '',
  numero_guia: '',
  observacion_logistica: '',
});

const descripcionRef = computed(() => formState.descripcion_general);
const { sugerencias } = useLogisticaDescriptionParser(descripcionRef, clientesOptions, proveedoresOptions);

function aplicarSugerencia(key, value) {
  if (key === 'tipo_logistica' && value) {
    formState.tipo_logistica = value;
  } else if (key === 'tipo_movimiento_encomienda' && value) {
    formState.tipo_movimiento_encomienda = value;
  } else if (key === 'paciente_referido' && value) {
    formState.paciente_referido = value;
  } else if (key === 'cliente_sugerido' && value?.id) {
    formState.cliente_id = value.id;
  } else if (key === 'proveedor_sugerido' && value?.id) {
    formState.proveedor_id = value.id;
  }
}

async function cargarOpciones() {
  loadingOptions.value = true;
  try {
    const [clientesRes, transportesRes, proveedoresRes, provinciasRes, tiposRes] = await Promise.all([
      supabase.from('clientes').select('id, nombre_cliente').order('nombre_cliente'),
      supabase.from('transportes').select('id, nombre').order('nombre'),
      supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('provincias').select('id, nombre').order('nombre'),
      supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto'),
    ]);

    if (clientesRes.data) clientesOptions.value = clientesRes.data.map(c => ({ code: c.id, label: c.nombre_cliente }));
    if (transportesRes.data) transportesOptions.value = transportesRes.data.map(t => ({ code: t.id, label: t.nombre }));
    if (proveedoresRes.data) proveedoresOptions.value = proveedoresRes.data.map(p => ({ code: p.id, label: p.nombre }));
    if (provinciasRes.data) provinciasOptions.value = provinciasRes.data.map(p => ({ code: p.id, label: p.nombre }));
    if (tiposRes.data) tiposGastoOptions.value = tiposRes.data;
  } catch (e) {
    console.error('Error cargando opciones en MovimientoLogisticoForm:', e);
  } finally {
    loadingOptions.value = false;
  }
}

async function handleProvinciaChange() {
  formState.localidad_destino_id = null;
  if (!formState.provincia_id) return;

  const key = String(formState.provincia_id);
  if (localidadesCache.value[key]) return;

  try {
    const { data, error } = await supabase
      .from('localidades')
      .select('id, nombre')
      .eq('provincia_id', formState.provincia_id)
      .order('nombre');

    if (error) throw error;
    localidadesCache.value[key] = (data || []).map(l => ({ code: l.id, label: l.nombre }));
  } catch (e) {
    console.error('Error cargando localidades:', e);
  }
}

const localidadOptionsActuales = computed(() => {
  if (!formState.provincia_id) return [];
  return localidadesCache.value[String(formState.provincia_id)] || [];
});

async function resolverClienteId(val) {
  if (!val) return null;
  if (typeof val === 'number' || (typeof val === 'string' && /^\d+$/.test(val))) {
    return Number(val);
  }
  let nombre = typeof val === 'object' ? (val.label || val.code) : val;
  nombre = String(nombre).trim();
  if (!nombre) return null;

  const { data: existing } = await supabase
    .from('clientes')
    .select('id')
    .ilike('nombre_cliente', nombre)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: newClient, error } = await supabase
    .from('clientes')
    .insert([{ nombre_cliente: nombre }])
    .select('id')
    .single();

  if (error) {
    console.error('Error auto-creando cliente:', error);
    return null;
  }
  if (newClient) {
    clientesOptions.value.push({ code: newClient.id, label: nombre });
    return newClient.id;
  }
  return null;
}

async function resolverTransporteId(val) {
  if (!val) return null;
  if (typeof val === 'number' || (typeof val === 'string' && /^\d+$/.test(val))) {
    return Number(val);
  }
  let nombre = typeof val === 'object' ? (val.label || val.code) : val;
  nombre = String(nombre).trim();
  if (!nombre) return null;

  const { data: existing } = await supabase
    .from('transportes')
    .select('id')
    .ilike('nombre', nombre)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: newTrans, error } = await supabase
    .from('transportes')
    .insert([{ nombre: nombre }])
    .select('id')
    .single();

  if (error) {
    console.error('Error auto-creando transporte:', error);
    return null;
  }
  if (newTrans) {
    transportesOptions.value.push({ code: newTrans.id, label: nombre });
    return newTrans.id;
  }
  return null;
}

async function resolverProveedorId(val) {
  if (!val) return null;
  if (typeof val === 'number' || (typeof val === 'string' && /^\d+$/.test(val))) {
    return Number(val);
  }
  let nombre = typeof val === 'object' ? (val.label || val.code) : val;
  nombre = String(nombre).trim();
  if (!nombre) return null;

  const { data: existing } = await supabase
    .from('proveedores')
    .select('id')
    .ilike('nombre', nombre)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: newProv, error } = await supabase
    .from('proveedores')
    .insert([{ nombre: nombre, activo: true }])
    .select('id')
    .single();

  if (error) {
    console.error('Error auto-creando proveedor:', error);
    return null;
  }
  if (newProv) {
    proveedoresOptions.value.push({ code: newProv.id, label: nombre });
    return newProv.id;
  }
  return null;
}

function resetForm() {
  formState.tipo_logistica = 'cirugia';
  formState.fecha_gasto = defaultDate();
  formState.transporte_id = null;
  formState.provincia_id = null;
  formState.localidad_destino_id = null;
  formState.destino_texto = '';
  formState.cliente_id = null;
  formState.paciente_referido = '';
  formState.proveedor_id = null;
  formState.cantidad_bultos = 1;
  formState.sentido_movimiento = 'ida';
  formState.tipo_movimiento_encomienda = 'Envío';
  formState.descripcion_general = '';
  formState.monto_total = '';
  formState.numero_guia = '';
  formState.observacion_logistica = '';
  errorMessage.value = '';
  successMessage.value = '';
}

function cerrarModal() {
  if (saving.value) return;
  emit('update:modelValue', false);
  emit('cancelar');
}

function handleKeyDown(e) {
  if (e.key === 'Escape' && !isEmbeddedMode.value && props.modelValue) {
    cerrarModal();
  }
}

async function handleGuardar() {
  errorMessage.value = '';
  successMessage.value = '';

  if (!formState.transporte_id) {
    errorMessage.value = 'Debe seleccionar la Empresa de Transporte.';
    return;
  }

  if (formState.tipo_logistica === 'cirugia') {
    if (!formState.cliente_id) {
      errorMessage.value = 'Para Logística de Cirugía debe seleccionar un Cliente / Obra Social.';
      return;
    }
    if (!formState.paciente_referido?.trim()) {
      errorMessage.value = 'Para Logística de Cirugía debe ingresar el Paciente Referido.';
      return;
    }
  } else {
    if (!formState.proveedor_id) {
      errorMessage.value = 'Para Proveedor / Otros debe seleccionar el Proveedor Vinculado.';
      return;
    }
  }

  if (formState.cantidad_bultos === null || formState.cantidad_bultos === undefined || Number(formState.cantidad_bultos) <= 0) {
    errorMessage.value = 'La Cantidad de Bultos es un campo obligatorio y debe ser al menos 1.';
    return;
  }

  const monto = Number(formState.monto_total);
  if (!Number.isFinite(monto) || monto <= 0) {
    errorMessage.value = 'Debe ingresar un Importe válido mayor a 0.';
    return;
  }

  saving.value = true;
  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) throw new Error('Usuario no autenticado.');

    const [finalClienteId, finalTransporteId, finalProveedorId] = await Promise.all([
      resolverClienteId(formState.cliente_id),
      resolverTransporteId(formState.transporte_id),
      resolverProveedorId(formState.proveedor_id)
    ]);

    let tipoGastoId = 22; // Fallback Estándar (Despacho / Envíos)
    const matchTipo = tiposGastoOptions.value.find(t => {
      const name = (t.nombre_tipo_gasto || '').toLowerCase();
      return name.includes('despacho') || name.includes('envío') || name.includes('envio');
    });
    if (matchTipo) tipoGastoId = matchTipo.id;

    const payload = {
      user_id: userId,
      creado_por_id: userId,
      formato_id: 1,
      tipo_gasto_id: tipoGastoId,
      origen_gasto: 'cuenta_corriente_empresa',
      estado_delegacion: 'directo',
      fecha_gasto: `${formState.fecha_gasto}T12:00:00Z`,
      descripcion_general: formState.descripcion_general?.trim() || `Despacho ${formState.tipo_movimiento_encomienda}`,
      monto_total: monto,
      cliente_id: finalClienteId,
      transporte_id: finalTransporteId,
      proveedor_id: formState.tipo_logistica === 'cirugia' ? null : finalProveedorId,
      provincia_id: formState.provincia_id || null,
      localidad_destino_id: formState.localidad_destino_id || null,
      numero_factura: formState.numero_guia?.trim() || null,
      paciente_referido: formState.paciente_referido?.trim() || null,
      datos_adicionales: {
        modulo: 'logistica',
        origen_carga: 'formulario_movimientos',
        tipo_logistica: formState.tipo_logistica,
        tipo_movimiento_encomienda: formState.tipo_movimiento_encomienda,
        cantidad_bultos: Number(formState.cantidad_bultos) || 1,
        sentido_movimiento: formState.sentido_movimiento,
        destino_texto: formState.destino_texto?.trim() || null,
        observacion_logistica: formState.observacion_logistica?.trim() || null,
      },
    };

    const { data, error } = await supabase
      .from('gastos')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    successMessage.value = 'Movimiento registrado con éxito.';
    emit('saved', data);
    if (!isEmbeddedMode.value) {
      setTimeout(() => {
        cerrarModal();
      }, 500);
    }
  } catch (e) {
    console.error('Error guardando movimiento logístico:', e);
    errorMessage.value = e.message || 'No se pudo guardar el movimiento.';
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  cargarOpciones();
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});

watch(() => props.initialData, (newVal) => {
  if (newVal && Object.keys(newVal).length > 0) {
    Object.assign(formState, newVal);
  }
}, { immediate: true });

watch(formState, (newVal) => {
  if (isEmbeddedMode.value && props.initialData) {
    Object.assign(props.initialData, newVal);
  }
}, { deep: true });
</script>

<template>
  <!-- Modo Standalone (Modal con backdrop) -->
  <div
    v-if="!isEmbeddedMode && modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 md:p-6"
    @click.self="cerrarModal"
  >
    <div class="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
      <!-- Encabezado Modal Fijo -->
      <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
        <div>
          <h3 class="text-lg font-bold text-slate-900">Registrar Movimiento Logístico</h3>
          <p class="text-xs text-slate-500">Completá los datos del envío y transporte</p>
        </div>
        <button
          type="button"
          class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
          aria-label="Cerrar modal"
          @click="cerrarModal"
        >
          ✕
        </button>
      </div>

      <!-- Cuerpo del Formulario -->
      <div class="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        <div v-if="errorMessage" class="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
          {{ errorMessage }}
        </div>
        <div v-if="successMessage" class="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
          {{ successMessage }}
        </div>

        <div class="space-y-6">
          <!-- Selector de Flujo Compacto y Responsivo -->
          <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-3 shadow-2xs">
            <label class="mb-2 block text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1">
              <span>¿A qué corresponde este movimiento?</span>
              <span class="text-red-500">*</span>
            </label>

            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <!-- Opción 1: Logística de Cirugía -->
              <button
                type="button"
                class="group flex flex-col justify-between rounded-lg border p-2.5 text-left transition-all cursor-pointer"
                :class="formState.tipo_logistica === 'cirugia'
                  ? 'border-indigo-500 bg-indigo-50/80 font-medium text-slate-900 shadow-2xs ring-1 ring-indigo-500/30'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-slate-50'"
                @click="formState.tipo_logistica = 'cirugia'"
              >
                <div class="flex items-center justify-between">
                  <span class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                        :class="formState.tipo_logistica === 'cirugia' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-700'">
                    🏥 1. Logística de Cirugía
                  </span>
                  <span v-if="formState.tipo_logistica === 'cirugia'" class="h-1.5 w-1.5 rounded-full bg-indigo-600"></span>
                </div>

                <div class="mt-1.5">
                  <h4 class="text-xs font-bold text-slate-900">Cirugías & Obras Sociales</h4>
                  <p class="text-[11px] text-slate-500 leading-tight">Requiere <strong>Cliente</strong> y <strong>Paciente</strong>.</p>
                </div>
              </button>

              <!-- Opción 2: Proveedor / Otros -->
              <button
                type="button"
                class="group flex flex-col justify-between rounded-lg border p-2.5 text-left transition-all cursor-pointer"
                :class="formState.tipo_logistica === 'proveedor_otros'
                  ? 'border-indigo-500 bg-indigo-50/80 font-medium text-slate-900 shadow-2xs ring-1 ring-indigo-500/30'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-slate-50'"
                @click="formState.tipo_logistica = 'proveedor_otros'"
              >
                <div class="flex items-center justify-between">
                  <span class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                        :class="formState.tipo_logistica === 'proveedor_otros' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-700'">
                    📦 2. Proveedor / Otros
                  </span>
                  <span v-if="formState.tipo_logistica === 'proveedor_otros'" class="h-1.5 w-1.5 rounded-full bg-indigo-600"></span>
                </div>

                <div class="mt-1.5">
                  <h4 class="text-xs font-bold text-slate-900">Compras & Gastos Operativos</h4>
                  <p class="text-[11px] text-slate-500 leading-tight">Requiere <strong>Proveedor vinculado</strong>.</p>
                </div>
              </button>
            </div>
          </div>

          <!-- Campos de Entrada -->
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label class="field-group">
              <span class="field-label">Fecha del Movimiento <span class="text-red-500">*</span></span>
              <input v-model="formState.fecha_gasto" type="date" class="form-input" />
            </label>

            <label class="field-group">
              <span class="field-label">Empresa de Transporte <span class="text-red-500">*</span></span>
              <v-select
                v-model="formState.transporte_id"
                :options="transportesOptions"
                :reduce="o => o.code"
                :loading="loadingOptions"
                taggable
                :create-option="(label) => ({ code: label, label: label, __isNew: true })"
                placeholder="Seleccionar o crear transporte..."
                class="v-select-filter"
              />
            </label>

            <div class="field-group md:col-span-2">
              <span class="field-label">Descripción Operativa</span>
              <input v-model="formState.descripcion_general" type="text" class="form-input" placeholder="Ej: ENCOMIENDA FORMOSA PTE HIDALGO RAMON DOLORES" />
              
              <div v-if="sugerencias.hasSuggestions" class="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-indigo-100 bg-indigo-50/50 p-2 text-xs">
                <span class="font-bold text-indigo-900">Sugerencias:</span>
                <button v-if="sugerencias.tipo_logistica" type="button" class="suggestion-chip" @click="aplicarSugerencia('tipo_logistica', sugerencias.tipo_logistica)">Modo: Cirugía</button>
                <button v-if="sugerencias.tipo_movimiento_encomienda" type="button" class="suggestion-chip" @click="aplicarSugerencia('tipo_movimiento_encomienda', sugerencias.tipo_movimiento_encomienda)">Mov: {{ sugerencias.tipo_movimiento_encomienda }}</button>
                <button v-if="sugerencias.paciente_referido" type="button" class="suggestion-chip" @click="aplicarSugerencia('paciente_referido', sugerencias.paciente_referido)">Paciente: {{ sugerencias.paciente_referido }}</button>
                <button v-if="sugerencias.cliente_sugerido" type="button" class="suggestion-chip" @click="aplicarSugerencia('cliente_sugerido', sugerencias.cliente_sugerido)">Cliente: {{ sugerencias.cliente_sugerido.label }}</button>
                <button v-if="sugerencias.proveedor_sugerido" type="button" class="suggestion-chip" @click="aplicarSugerencia('proveedor_sugerido', sugerencias.proveedor_sugerido)">Proveedor: {{ sugerencias.proveedor_sugerido.label }}</button>
              </div>
            </div>

            <!-- MODO LOGÍSTICA DE CIRUGÍA: SIN PROVEEDOR VINCULADO -->
            <template v-if="formState.tipo_logistica === 'cirugia'">
              <label class="field-group">
                <span class="field-label">Cliente / Obra Social <span class="text-red-500">*</span></span>
                <v-select
                  v-model="formState.cliente_id"
                  :options="clientesOptions"
                  :reduce="o => o.code"
                  :loading="loadingOptions"
                  taggable
                  :create-option="(label) => ({ code: label, label: label, __isNew: true })"
                  placeholder="Seleccionar o escribir para crear cliente..."
                  class="v-select-filter"
                />
              </label>

              <label class="field-group">
                <span class="field-label">Paciente Referido <span class="text-red-500">*</span></span>
                <input v-model="formState.paciente_referido" type="text" class="form-input" placeholder="Nombre completo del paciente" />
              </label>

              <label class="field-group md:col-span-2">
                <span class="field-label">Sentido del Envío</span>
                <select v-model="formState.sentido_movimiento" class="form-input">
                  <option value="ida">Ida</option>
                  <option value="vuelta">Vuelta</option>
                  <option value="ida_y_vuelta">Ida y Vuelta</option>
                </select>
              </label>
            </template>

            <!-- MODO PROVEEDOR / OTROS -->
            <template v-else>
              <label class="field-group md:col-span-2">
                <span class="field-label">Proveedor Vinculado <span class="text-red-500">*</span></span>
                <v-select
                  v-model="formState.proveedor_id"
                  :options="proveedoresOptions"
                  :reduce="o => o.code"
                  :loading="loadingOptions"
                  taggable
                  :create-option="(label) => ({ code: label, label: label, __isNew: true })"
                  placeholder="Seleccionar o crear proveedor..."
                  class="v-select-filter"
                />
              </label>
            </template>

            <label class="field-group">
              <span class="field-label">Provincia Destino</span>
              <v-select v-model="formState.provincia_id" :options="provinciasOptions" :reduce="o => o.code" placeholder="Provincia" class="v-select-filter" @update:modelValue="handleProvinciaChange" />
            </label>

            <label class="field-group">
              <span class="field-label">Localidad Destino</span>
              <v-select v-model="formState.localidad_destino_id" :options="localidadOptionsActuales" :reduce="o => o.code" :disabled="!formState.provincia_id" placeholder="Localidad" class="v-select-filter" />
            </label>

            <label class="field-group">
              <span class="field-label">Cantidad de Bultos <span class="text-red-500">*</span></span>
              <input v-model.number="formState.cantidad_bultos" type="number" min="1" required class="form-input font-bold" placeholder="1" />
            </label>

            <label class="field-group">
              <span class="field-label">Tipo de Movimiento</span>
              <select v-model="formState.tipo_movimiento_encomienda" class="form-input">
                <option value="Envío">Envío</option>
                <option value="Recepción">Recepción</option>
                <option value="Devolución">Devolución</option>
                <option value="Reposición">Reposición</option>
                <option value="Retiro">Retiro</option>
              </select>
            </label>

            <label class="field-group">
              <span class="field-label">Importe del Movimiento ($) <span class="text-red-500">*</span></span>
              <input v-model="formState.monto_total" type="number" min="0" step="0.01" class="form-input font-bold text-slate-900" placeholder="0.00" />
            </label>

            <label class="field-group">
              <span class="field-label">N° de Guía / Remito</span>
              <input v-model="formState.numero_guia" type="text" class="form-input" placeholder="Ej: 123456" />
            </label>

            <label class="field-group md:col-span-2">
              <span class="field-label">Observación Logística</span>
              <input v-model="formState.observacion_logistica" type="text" class="form-input" placeholder="Notas internas de la operación" />
            </label>
          </div>
        </div>
      </div>

      <!-- Footer Modal Fijo -->
      <div class="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
        <button type="button" class="btn-secondary" :disabled="saving" @click="cerrarModal">Cancelar</button>
        <button type="button" class="btn-primary" :disabled="saving || loadingOptions" @click="handleGuardar">
          {{ saving ? 'Guardando...' : 'Guardar Movimiento' }}
        </button>
      </div>
    </div>
  </div>

  <!-- Modo Embedded (Renderizado limpio sin modal, sin backdrop, sin footer extra) -->
  <div v-else-if="isEmbeddedMode" class="space-y-6">
    <!-- Selector de Flujo Compacto y Responsivo -->
    <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-3 shadow-2xs">
      <label class="mb-2 block text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1">
        <span>¿A qué corresponde este movimiento?</span>
        <span class="text-red-500">*</span>
      </label>

      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <!-- Opción 1: Logística de Cirugía -->
        <button
          type="button"
          class="group flex flex-col justify-between rounded-lg border p-2.5 text-left transition-all cursor-pointer"
          :class="formState.tipo_logistica === 'cirugia'
            ? 'border-indigo-500 bg-indigo-50/80 font-medium text-slate-900 shadow-2xs ring-1 ring-indigo-500/30'
            : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-slate-50'"
          @click="formState.tipo_logistica = 'cirugia'"
        >
          <div class="flex items-center justify-between">
            <span class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  :class="formState.tipo_logistica === 'cirugia' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-700'">
              🏥 1. Logística de Cirugía
            </span>
            <span v-if="formState.tipo_logistica === 'cirugia'" class="h-1.5 w-1.5 rounded-full bg-indigo-600"></span>
          </div>

          <div class="mt-1.5">
            <h4 class="text-xs font-bold text-slate-900">Cirugías & Obras Sociales</h4>
            <p class="text-[11px] text-slate-500 leading-tight">Requiere <strong>Cliente</strong> y <strong>Paciente</strong>.</p>
          </div>
        </button>

        <!-- Opción 2: Proveedor / Otros -->
        <button
          type="button"
          class="group flex flex-col justify-between rounded-lg border p-2.5 text-left transition-all cursor-pointer"
          :class="formState.tipo_logistica === 'proveedor_otros'
            ? 'border-indigo-500 bg-indigo-50/80 font-medium text-slate-900 shadow-2xs ring-1 ring-indigo-500/30'
            : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-slate-50'"
          @click="formState.tipo_logistica = 'proveedor_otros'"
        >
          <div class="flex items-center justify-between">
            <span class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  :class="formState.tipo_logistica === 'proveedor_otros' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-700'">
              📦 2. Proveedor / Otros
            </span>
            <span v-if="formState.tipo_logistica === 'proveedor_otros'" class="h-1.5 w-1.5 rounded-full bg-indigo-600"></span>
          </div>

          <div class="mt-1.5">
            <h4 class="text-xs font-bold text-slate-900">Compras & Gastos Operativos</h4>
            <p class="text-[11px] text-slate-500 leading-tight">Requiere <strong>Proveedor vinculado</strong>.</p>
          </div>
        </button>
      </div>
    </div>

    <!-- Campos del Formulario Embebido -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <label class="field-group">
        <span class="field-label">Empresa de Transporte <span class="text-red-500">*</span></span>
        <v-select
          v-model="formState.transporte_id"
          :options="transportesOptions"
          :reduce="o => o.code"
          :loading="loadingOptions"
          taggable
          :create-option="(label) => ({ code: label, label: label, __isNew: true })"
          placeholder="Seleccionar o crear transporte..."
          class="v-select-filter"
        />
      </label>

      <div class="field-group md:col-span-2">
        <span class="field-label">Descripción Operativa</span>
        <input v-model="formState.descripcion_general" type="text" class="form-input" placeholder="Ej: ENCOMIENDA FORMOSA PTE HIDALGO RAMON DOLORES" />
        
        <div v-if="sugerencias.hasSuggestions" class="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-indigo-100 bg-indigo-50/50 p-2 text-xs">
          <span class="font-bold text-indigo-900">Sugerencias:</span>
          <button v-if="sugerencias.tipo_logistica" type="button" class="suggestion-chip" @click="aplicarSugerencia('tipo_logistica', sugerencias.tipo_logistica)">Modo: Cirugía</button>
          <button v-if="sugerencias.tipo_movimiento_encomienda" type="button" class="suggestion-chip" @click="aplicarSugerencia('tipo_movimiento_encomienda', sugerencias.tipo_movimiento_encomienda)">Mov: {{ sugerencias.tipo_movimiento_encomienda }}</button>
          <button v-if="sugerencias.paciente_referido" type="button" class="suggestion-chip" @click="aplicarSugerencia('paciente_referido', sugerencias.paciente_referido)">Paciente: {{ sugerencias.paciente_referido }}</button>
          <button v-if="sugerencias.cliente_sugerido" type="button" class="suggestion-chip" @click="aplicarSugerencia('cliente_sugerido', sugerencias.cliente_sugerido)">Cliente: {{ sugerencias.cliente_sugerido.label }}</button>
          <button v-if="sugerencias.proveedor_sugerido" type="button" class="suggestion-chip" @click="aplicarSugerencia('proveedor_sugerido', sugerencias.proveedor_sugerido)">Proveedor: {{ sugerencias.proveedor_sugerido.label }}</button>
        </div>
      </div>

      <!-- MODO LOGÍSTICA DE CIRUGÍA: SIN PROVEEDOR VINCULADO -->
      <template v-if="formState.tipo_logistica === 'cirugia'">
        <label class="field-group">
          <span class="field-label">Cliente / Obra Social <span class="text-red-500">*</span></span>
          <v-select
            v-model="formState.cliente_id"
            :options="clientesOptions"
            :reduce="o => o.code"
            :loading="loadingOptions"
            taggable
            :create-option="(label) => ({ code: label, label: label, __isNew: true })"
            placeholder="Seleccionar o escribir para crear cliente..."
            class="v-select-filter"
          />
        </label>

        <label class="field-group">
          <span class="field-label">Paciente Referido <span class="text-red-500">*</span></span>
          <input v-model="formState.paciente_referido" type="text" class="form-input" placeholder="Nombre completo del paciente" />
        </label>

        <label class="field-group md:col-span-2">
          <span class="field-label">Sentido del Envío</span>
          <select v-model="formState.sentido_movimiento" class="form-input">
            <option value="ida">Ida</option>
            <option value="vuelta">Vuelta</option>
            <option value="ida_y_vuelta">Ida y Vuelta</option>
          </select>
        </label>
      </template>

      <!-- MODO PROVEEDOR / OTROS -->
      <template v-else>
        <label class="field-group md:col-span-2">
          <span class="field-label">Proveedor Vinculado <span class="text-red-500">*</span></span>
          <v-select
            v-model="formState.proveedor_id"
            :options="proveedoresOptions"
            :reduce="o => o.code"
            :loading="loadingOptions"
            taggable
            :create-option="(label) => ({ code: label, label: label, __isNew: true })"
            placeholder="Seleccionar o crear proveedor..."
            class="v-select-filter"
          />
        </label>
      </template>

      <label class="field-group">
        <span class="field-label">Provincia Destino</span>
        <v-select v-model="formState.provincia_id" :options="provinciasOptions" :reduce="o => o.code" placeholder="Provincia" class="v-select-filter" @update:modelValue="handleProvinciaChange" />
      </label>

      <label class="field-group">
        <span class="field-label">Localidad Destino</span>
        <v-select v-model="formState.localidad_destino_id" :options="localidadOptionsActuales" :reduce="o => o.code" :disabled="!formState.provincia_id" placeholder="Localidad" class="v-select-filter" />
      </label>

      <label class="field-group">
        <span class="field-label">Cantidad de Bultos <span class="text-red-500">*</span></span>
        <input v-model.number="formState.cantidad_bultos" type="number" min="1" required class="form-input font-bold" placeholder="1" />
      </label>

      <label class="field-group">
        <span class="field-label">Tipo de Movimiento</span>
        <select v-model="formState.tipo_movimiento_encomienda" class="form-input">
          <option value="Envío">Envío</option>
          <option value="Recepción">Recepción</option>
          <option value="Devolución">Devolución</option>
          <option value="Reposición">Reposición</option>
          <option value="Retiro">Retiro</option>
        </select>
      </label>

      <label class="field-group">
        <span class="field-label">N° de Guía / Remito</span>
        <input v-model="formState.numero_guia" type="text" class="form-input" placeholder="Ej: 123456" />
      </label>

      <label class="field-group md:col-span-2">
        <span class="field-label">Observación Logística</span>
        <input v-model="formState.observacion_logistica" type="text" class="form-input" placeholder="Notas internas de la operación" />
      </label>
    </div>
  </div>
</template>

<style scoped>
.form-input { @apply block w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm; }
.btn-primary { @apply rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50 cursor-pointer; }
.btn-secondary { @apply rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 cursor-pointer; }
.field-group { @apply flex flex-col gap-1.5; }
.field-label { @apply text-xs font-bold uppercase tracking-wider text-slate-600; }
.suggestion-chip { @apply rounded-md border border-indigo-200 bg-white px-2 py-0.5 text-xs font-semibold text-indigo-700 shadow-sm hover:bg-indigo-100 cursor-pointer; }
.v-select-filter { --vs-border-radius: 0.5rem; }
</style>
