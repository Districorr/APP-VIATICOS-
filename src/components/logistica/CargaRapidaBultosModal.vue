<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';
import DestinoSelect from '../DestinoSelect.vue';
import { supabase } from '../../supabaseClient.js';
import { useLogisticaDescriptionParser } from '../../composables/useLogisticaDescriptionParser.js';
import { formatCurrency } from '../../utils/formatters.js';
import {
  CubeIcon,
  TruckIcon,
  PlusIcon,
  MinusIcon,
  CheckIcon,
  XMarkIcon,
  InformationCircleIcon,
  CalculatorIcon,
  SparklesIcon,
  BanknotesIcon
} from '@heroicons/vue/24/outline';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'saved', 'show-notification']);

const saving = ref(false);
const loadingOptions = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const clientesOptions = ref([]);
const transportesOptions = ref([]);
const proveedoresOptions = ref([]);
const provinciasOptions = ref([]);
const localidadesCache = ref({});

// Tarifa prefijada por defecto ($20.000 por bulto)
const precioUnitarioPrefijado = ref(20000);
const permitirEdicionPrecioUnitario = ref(false);

const defaultDate = () => new Date().toISOString().split('T')[0];

const formState = reactive({
  tipo_logistica: 'cirugia',
  fecha_gasto: defaultDate(),
  cantidad_bultos: 1,
  transporte_id: null,
  provincia_id: null,
  localidad_destino_id: null,
  destino_texto: '',
  cliente_id: null,
  paciente_referido: '',
  proveedor_id: 14, // LOGISTICA CIRUGIA
  sentido_movimiento: 'ida',
  tipo_movimiento_encomienda: 'Envío',
  descripcion_general: '',
  monto_total: 20000,
  monto_manual: false,
  numero_guia: '',
  observacion_logistica: '',
});

// Tarifas prefijadas por empresa de transporte (Default = 0 para no cargar datos erróneos)
const TARIFA_POR_DEFECTO = 0;
const tarifaEspecialNombre = ref('');

function obtenerTarifaBultoPorTransporte(transporteVal) {
  if (!transporteVal) return TARIFA_POR_DEFECTO;

  let opt = null;
  let nombre = '';
  if (typeof transporteVal === 'object') {
    opt = transporteVal;
    nombre = transporteVal.label || transporteVal.nombre || '';
  } else {
    opt = transportesOptions.value.find(t =>
      String(t.code || t.value || t.id) === String(transporteVal) || t.label === String(transporteVal)
    );
    nombre = opt ? (opt.label || opt.nombre) : String(transporteVal);
  }

  if (opt && Number(opt.tarifa_por_bulto) > 0) return Number(opt.tarifa_por_bulto);

  const nameUpper = (nombre || '').toUpperCase();
  if (nameUpper.includes('LEDESMA')) return 30000;
  if (nameUpper.includes('DAMJA') || nameUpper.includes('ALAN')) return 20000;
  if (nameUpper.includes('MULLER') || nameUpper.includes('CLORINDA')) return 15000;

  return 0;
}

watch(() => formState.transporte_id, (newTrans) => {
  const tarifaCalculada = obtenerTarifaBultoPorTransporte(newTrans);
  precioUnitarioPrefijado.value = tarifaCalculada;

  if (newTrans) {
    if (tarifaCalculada === 0) {
      permitirEdicionPrecioUnitario.value = true;
    }

    let opt = transportesOptions.value.find(t => String(t.code || t.value || t.id) === String(newTrans));
    let nombre = opt ? opt.label : (typeof newTrans === 'object' ? newTrans.label : String(newTrans));
    
    if (opt && Number(opt.tarifa_por_bulto) > 0) {
      tarifaEspecialNombre.value = `${nombre} (${formatCurrency(opt.tarifa_por_bulto)} / bulto)`;
    } else {
      const nameUpper = (nombre || '').toUpperCase();
      if (nameUpper.includes('LEDESMA')) tarifaEspecialNombre.value = 'Expreso Ledesma ($30.000 / bulto)';
      else if (nameUpper.includes('DAMJA') || nameUpper.includes('ALAN')) tarifaEspecialNombre.value = 'Expreso Damja ($20.000 / bulto)';
      else if (nameUpper.includes('MULLER') || nameUpper.includes('CLORINDA')) tarifaEspecialNombre.value = 'Muller / Transporte Clorinda ($15.000 / bulto)';
      else tarifaEspecialNombre.value = '';
    }
  } else tarifaEspecialNombre.value = '';
}, { immediate: true });

// Auto-cálculo de Monto Total según bultos * precio unitario
watch([() => formState.cantidad_bultos, precioUnitarioPrefijado], ([cant, pUnit]) => {
  if (!formState.monto_manual) {
    const numBultos = Number(cant) || 1;
    const unitPrice = Number(pUnit) || 0;
    formState.monto_total = Math.round(numBultos * unitPrice);
  }
}, { immediate: true });

// Sugerencias inteligentes de la descripción
const descripcionRef = computed(() => formState.descripcion_general);
const { sugerencias } = useLogisticaDescriptionParser(descripcionRef, clientesOptions, proveedoresOptions);

function aplicarSugerencia(key, value) {
  if (key === 'tipo_logistica' && value) formState.tipo_logistica = value;
  else if (key === 'tipo_movimiento_encomienda' && value) formState.tipo_movimiento_encomienda = value;
  else if (key === 'paciente_referido' && value) formState.paciente_referido = value;
  else if (key === 'cliente_sugerido' && value?.id) formState.cliente_id = value.id;
  else if (key === 'proveedor_sugerido' && value?.id) formState.proveedor_id = value.id;
  else if (key === 'numero_guia_sugerido' && value) formState.numero_guia = value;
}

watch(() => sugerencias.value.numero_guia_sugerido, (newGuia) => {
  if (newGuia && !formState.numero_guia) {
    formState.numero_guia = newGuia;
  }
});

watch(() => formState.tipo_logistica, (newTipo) => {
  if (newTipo === 'cirugia') {
    const foundCirugia = proveedoresOptions.value.find(p => Number(p.value || p.code || p.id) === 14 || (p.label || '').toLowerCase().includes('cirug'));
    formState.proveedor_id = foundCirugia ? (foundCirugia.value || foundCirugia.code || foundCirugia.id || 14) : 14;
  } else if (Number(formState.proveedor_id) === 14) {
    formState.proveedor_id = null;
  }
}, { immediate: true });

async function cargarOpciones() {
  loadingOptions.value = true;
  try {
    const [clientesRes, transportesRes, proveedoresRes, provinciasRes] = await Promise.all([
      supabase.from('clientes').select('id, nombre_cliente').order('nombre_cliente'),
      supabase.from('transportes').select('id, nombre, tarifa_por_bulto').order('nombre'),
      supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('provincias').select('id, nombre').order('nombre'),
    ]);

    if (clientesRes.data) clientesOptions.value = clientesRes.data.map(c => ({ code: c.id, value: c.id, label: c.nombre_cliente }));
    if (transportesRes.data) transportesOptions.value = transportesRes.data.map(t => ({ code: t.id, value: t.id, label: t.nombre, nombre: t.nombre, tarifa_por_bulto: t.tarifa_por_bulto || 0 }));
    if (proveedoresRes.data) {
      const provs = proveedoresRes.data.map(p => ({ code: p.id, value: p.id, label: p.nombre }));
      if (!provs.some(p => Number(p.code || p.value || p.id) === 14)) {
        provs.unshift({ code: 14, value: 14, label: 'LOGISTICA CIRUGIA' });
      }
      proveedoresOptions.value = provs;
    }
    if (provinciasRes.data) provinciasOptions.value = provinciasRes.data.map(p => ({ code: p.id, value: p.id, label: p.nombre }));
  } catch (e) {
    console.error('Error cargando opciones en CargaRapidaBultosModal:', e);
  } finally {
    loadingOptions.value = false;
  }
}

function setBultosPreset(qty) {
  formState.cantidad_bultos = qty;
}

function adjustBultos(delta) {
  const current = Number(formState.cantidad_bultos) || 1;
  const next = Math.max(1, current + delta);
  formState.cantidad_bultos = next;
}

function handleCreateCliente(label) {
  const cleanLabel = (label || '').trim();
  const opt = { code: cleanLabel, value: cleanLabel, label: cleanLabel, __isNew: true };
  if (!clientesOptions.value.some(o => o.code === cleanLabel || o.value === cleanLabel || o.label === cleanLabel)) {
    clientesOptions.value.push(opt);
  }
  return opt;
}

function handleCreateTransporte(label) {
  const cleanLabel = (label || '').trim();
  const opt = { code: cleanLabel, value: cleanLabel, label: cleanLabel, __isNew: true };
  if (!transportesOptions.value.some(o => o.code === cleanLabel || o.value === cleanLabel || o.label === cleanLabel)) {
    transportesOptions.value.push(opt);
  }
  return opt;
}

function handleCreateProveedor(label) {
  const cleanLabel = (label || '').trim();
  const opt = { code: cleanLabel, value: cleanLabel, label: cleanLabel, __isNew: true };
  if (!proveedoresOptions.value.some(o => o.code === cleanLabel || o.value === cleanLabel || o.label === cleanLabel)) {
    proveedoresOptions.value.push(opt);
  }
  return opt;
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
    localidadesCache.value[key] = (data || []).map(l => ({ code: l.id, value: l.id, label: l.nombre }));
  } catch (e) {
    console.error('Error cargando localidades:', e);
  }
}

const localidadOptionsActuales = computed(() => {
  if (!formState.provincia_id) return [];
  return localidadesCache.value[String(formState.provincia_id)] || [];
});

function extractEntityId(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'string' && /^\d+$/.test(val.trim())) return Number(val.trim());
  if (typeof val === 'object') {
    const rawId = val.code ?? val.value ?? val.id;
    if (typeof rawId === 'number') return rawId;
    if (typeof rawId === 'string' && /^\d+$/.test(rawId.trim())) return Number(rawId.trim());
    if (typeof rawId === 'string' && rawId.trim() !== '') return rawId.trim();
    if (val.label && val.__isNew) return val.label.trim();
  }
  if (typeof val === 'string' && val.trim() !== '') return val.trim();
  return val;
}

async function resolverClienteId(val) {
  if (!val) return null;
  const idExtraido = extractEntityId(val);
  if (typeof idExtraido === 'number') return idExtraido;
  let nombre = typeof val === 'object' ? (val.label || val.code || val.value || val.nombre_cliente) : val;
  nombre = String(nombre || '').trim();
  if (!nombre) return null;
  if (/^\d+$/.test(nombre)) return Number(nombre);

  const { data: existing } = await supabase.from('clientes').select('id').ilike('nombre_cliente', nombre).maybeSingle();
  if (existing) return existing.id;

  const { data: newId, error } = await supabase.rpc('crear_entidad_al_vuelo', { p_nombre_entidad: nombre, p_nombre_tabla: 'clientes' });
  if (error) throw new Error(`Error al crear cliente "${nombre}": ${error.message}`);
  if (newId) {
    clientesOptions.value.push({ code: newId, value: newId, label: nombre });
    return newId;
  }
  return null;
}

async function resolverTransporteId(val) {
  if (!val) return null;
  const idExtraido = extractEntityId(val);
  if (typeof idExtraido === 'number') return idExtraido;
  let nombre = typeof val === 'object' ? (val.label || val.code || val.value || val.nombre) : val;
  nombre = String(nombre || '').trim();
  if (!nombre) return null;
  if (/^\d+$/.test(nombre)) return Number(nombre);

  const { data: existing } = await supabase.from('transportes').select('id').ilike('nombre', nombre).maybeSingle();
  if (existing) return existing.id;

  const { data: newId, error } = await supabase.rpc('crear_entidad_al_vuelo', { p_nombre_entidad: nombre, p_nombre_tabla: 'transportes' });
  if (error) throw new Error(`Error al crear transporte "${nombre}": ${error.message}`);
  if (newId) {
    transportesOptions.value.push({ code: newId, value: newId, label: nombre });
    return newId;
  }
  return null;
}

async function resolverProveedorId(val) {
  if (!val) return null;
  const idExtraido = extractEntityId(val);
  if (typeof idExtraido === 'number') return idExtraido;
  let nombre = typeof val === 'object' ? (val.label || val.code || val.value || val.nombre) : val;
  nombre = String(nombre || '').trim();
  if (!nombre) return null;
  if (/^\d+$/.test(nombre)) return Number(nombre);

  const { data: existing } = await supabase.from('proveedores').select('id').ilike('nombre', nombre).maybeSingle();
  if (existing) return existing.id;

  const { data: newId, error } = await supabase.rpc('crear_entidad_al_vuelo', { p_nombre_entidad: nombre, p_nombre_tabla: 'proveedores' });
  if (error) throw new Error(`Error al crear proveedor "${nombre}": ${error.message}`);
  if (newId) {
    proveedoresOptions.value.push({ code: newId, value: newId, label: nombre });
    return newId;
  }
  return null;
}

function resetForm() {
  formState.tipo_logistica = 'cirugia';
  formState.fecha_gasto = defaultDate();
  formState.cantidad_bultos = 1;
  formState.transporte_id = null;
  formState.provincia_id = null;
  formState.localidad_destino_id = null;
  formState.destino_texto = '';
  formState.cliente_id = null;
  formState.paciente_referido = '';
  formState.proveedor_id = 14;
  formState.sentido_movimiento = 'ida';
  formState.tipo_movimiento_encomienda = 'Envío';
  formState.descripcion_general = '';
  formState.monto_total = precioUnitarioPrefijado.value;
  formState.monto_manual = false;
  formState.numero_guia = '';
  formState.observacion_logistica = '';
  errorMessage.value = '';
  successMessage.value = '';
}

function cerrarModal() {
  if (saving.value) return;
  emit('update:modelValue', false);
}

async function handleGuardar() {
  errorMessage.value = '';
  successMessage.value = '';

  const numBultos = Number(formState.cantidad_bultos);
  if (!Number.isInteger(numBultos) || numBultos <= 0) {
    errorMessage.value = 'La Cantidad de Bultos debe ser un número entero mayor o igual a 1.';
    return;
  }

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
    if (!formState.proveedor_id) {
      formState.proveedor_id = 14;
    }
  } else {
    if (!formState.proveedor_id) {
      errorMessage.value = 'Para Proveedor / Otros debe seleccionar el Proveedor Vinculado.';
      return;
    }
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

    const isCirugia = formState.tipo_logistica === 'cirugia';
    const provToResolve = isCirugia ? (formState.proveedor_id || 14) : formState.proveedor_id;
    const [finalClienteId, finalTransporteId, finalProveedorId] = await Promise.all([
      isCirugia ? resolverClienteId(formState.cliente_id) : Promise.resolve(null),
      resolverTransporteId(formState.transporte_id),
      resolverProveedorId(provToResolve)
    ]);

    const obsUsuario = formState.observacion_logistica?.trim() || '';
    const autoObsBultos = '📦 [Carga Rápida de Bultos Directos]';
    const finalObsLogistica = obsUsuario 
      ? (obsUsuario.includes('[Carga Rápida de Bultos Directos]') ? obsUsuario : `${autoObsBultos} ${obsUsuario}`)
      : autoObsBultos;

    const payload = {
      user_id: userId,
      creado_por_id: userId,
      formato_id: 1,
      tipo_gasto_id: 22, // Despacho / Envíos
      origen_gasto: 'cuenta_corriente_empresa',
      estado_delegacion: 'directo',
      fecha_gasto: `${formState.fecha_gasto}T12:00:00Z`,
      descripcion_general: formState.descripcion_general?.trim() || `Despacho ${numBultos} bulto(s) - ${formState.tipo_movimiento_encomienda}`,
      monto_total: monto,
      cliente_id: isCirugia ? finalClienteId : null,
      transporte_id: finalTransporteId,
      proveedor_id: isCirugia ? null : (finalProveedorId || null),
      provincia_id: formState.provincia_id || null,
      localidad_destino_id: formState.localidad_destino_id || null,
      numero_factura: formState.numero_guia?.trim() || null,
      paciente_referido: isCirugia ? (formState.paciente_referido?.trim() || null) : null,
      datos_adicionales: {
        modulo: 'logistica',
        origen_carga: 'carga_rapida_bultos',
        tipo_logistica: formState.tipo_logistica,
        tipo_movimiento_encomienda: formState.tipo_movimiento_encomienda || 'Envío',
        cantidad_bultos: numBultos,
        precio_unitario_prefijado: Number(precioUnitarioPrefijado.value),
        sentido_movimiento: formState.sentido_movimiento || 'ida',
        destino_texto: formState.destino_texto?.trim() || null,
        observacion_logistica: finalObsLogistica,
      }
    };

    const { data: inserted, error: insertErr } = await supabase
      .from('gastos')
      .insert([payload])
      .select('*')
      .single();

    if (insertErr) throw insertErr;

    successMessage.value = '¡Bultos registrados exitosamente!';
    emit('saved', inserted);
    emit('show-notification', 'Carga de Bultos Exitosa', `Se registraron ${numBultos} bulto(s) en cuenta corriente por ${formatCurrency(monto)}.`, 'success');

    setTimeout(() => {
      resetForm();
      cerrarModal();
    }, 600);

  } catch (e) {
    console.error('Error guardando carga rápida de bultos:', e);
    errorMessage.value = e.message || 'No se pudo guardar la carga de bultos.';
  } finally {
    saving.value = false;
  }
}

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    cargarOpciones();
    resetForm();
  }
});
</script>

<template>
  <transition
    enter-active-class="transition ease-out duration-200"
    enter-from-class="opacity-0 scale-95"
    enter-to-class="opacity-100 scale-100"
    leave-active-class="transition ease-in duration-150"
    leave-from-class="opacity-100 scale-100"
    leave-to-class="opacity-0 scale-95"
  >
    <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-3 md:p-4 backdrop-blur-xs">
      <div class="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">

        <!-- CABECERA DESTACADA CON BADGE DE PASO OMITIDO Y CUENTA CORRIENTE -->
        <div class="bg-gradient-to-r from-indigo-700 via-indigo-600 to-blue-600 p-5 text-white">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md text-white shadow-inner">
                <CubeIcon class="h-6 w-6" />
              </div>
              <div>
                <h3 class="text-lg font-bold tracking-tight">Carga Rápida de Bultos / Encomiendas</h3>
                <p class="text-xs text-indigo-100 font-medium">Imputación directa a Cuenta Corriente • Despachos y Envíos</p>
              </div>
            </div>
            <button
              type="button"
              class="rounded-lg p-1.5 text-white/80 hover:bg-white/20 hover:text-white transition-colors cursor-pointer"
              @click="cerrarModal"
            >
              <XMarkIcon class="h-6 w-6" />
            </button>
          </div>

          <!-- BANNER EXPLICATIVO -->
          <div class="mt-3 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-indigo-50 border border-white/15">
            <SparklesIcon class="h-4 w-4 text-amber-300 shrink-0" />
            <span>Paso 1 (Montos y Destino) omitido automáticamente: la carga se registra directo en Cuenta Corriente con tarifa calculada por bulto.</span>
          </div>
        </div>

        <!-- CUERPO DEL MODAL CON PRIORIDAD EN CANTIDAD DE BULTOS -->
        <form @submit.prevent="handleGuardar" class="p-5 space-y-4 max-h-[75vh] overflow-y-auto">

          <div v-if="errorMessage" class="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
            ⚠️ {{ errorMessage }}
          </div>

          <div v-if="successMessage" class="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
            ✅ {{ successMessage }}
          </div>

          <!-- SECCIÓN DE ALTA PRIORIDAD: BULTOS & CÁLCULO AUTOMÁTICO DE MONTO -->
          <div class="rounded-2xl border-2 border-indigo-500/40 bg-indigo-50/40 p-4 space-y-3">
            <div class="flex items-center justify-between">
              <label class="text-xs font-extrabold uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                <CubeIcon class="h-4 w-4 text-indigo-600" />
                <span>1. Cantidad de Bultos Enviados</span>
                <span class="text-rose-500">*</span>
              </label>

              <!-- Botones Presets Rápidos -->
              <div class="flex items-center gap-1">
                <span class="text-[11px] font-bold text-slate-500 mr-1">Rápido:</span>
                <button
                  v-for="preset in [1, 2, 3, 5, 10]"
                  :key="preset"
                  type="button"
                  class="rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer"
                  :class="Number(formState.cantidad_bultos) === preset ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'"
                  @click="setBultosPreset(preset)"
                >
                  {{ preset }}
                </button>
              </div>
            </div>

            <!-- Selector de Cantidad Grande con botones +/- -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div class="flex items-center rounded-xl border border-slate-300 bg-white p-1 shadow-inner">
                <button
                  type="button"
                  class="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer font-bold"
                  @click="adjustBultos(-1)"
                >
                  <MinusIcon class="h-5 w-5" />
                </button>

                <input
                  v-model.number="formState.cantidad_bultos"
                  type="number"
                  min="1"
                  step="1"
                  required
                  class="w-full text-center text-xl font-extrabold text-slate-900 focus:outline-none"
                />

                <button
                  type="button"
                  class="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-800 hover:bg-indigo-200 cursor-pointer font-bold"
                  @click="adjustBultos(1)"
                >
                  <PlusIcon class="h-5 w-5" />
                </button>
              </div>

              <!-- Cálculo de Monto Automático por Tarifa -->
              <div class="rounded-xl border border-indigo-200 bg-white p-3 shadow-xs space-y-1">
                <div class="flex items-center justify-between text-[11px] font-bold text-slate-500">
                  <span class="flex items-center gap-1">
                    <CalculatorIcon class="h-3.5 w-3.5 text-indigo-600" />
                    Cálculo automático:
                  </span>
                  <button
                    type="button"
                    class="text-indigo-600 hover:underline text-[10px]"
                    @click="permitirEdicionPrecioUnitario = !permitirEdicionPrecioUnitario"
                  >
                    {{ permitirEdicionPrecioUnitario ? 'Ocultar tarifa' : 'Editar tarifa unit.' }}
                  </button>
                </div>

                <div class="flex items-baseline justify-between">
                  <span class="text-xs text-slate-600">
                    <strong>{{ formState.cantidad_bultos || 1 }}</strong> bulto(s) × {{ formatCurrency(precioUnitarioPrefijado) }}
                  </span>
                  <strong class="text-lg font-extrabold text-indigo-700">{{ formatCurrency(formState.monto_total) }}</strong>
                </div>

                <div v-if="permitirEdicionPrecioUnitario" class="pt-2 border-t border-slate-100 flex items-center gap-2">
                  <span class="text-[11px] font-semibold text-slate-600">Tarifa / bulto ($):</span>
                  <input
                    v-model.number="precioUnitarioPrefijado"
                    type="number"
                    min="0"
                    step="1000"
                    class="form-input text-xs w-28 py-0.5"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- MODO OPERATIVO: LOGÍSTICA CIRUGÍA vs PROVEEDOR / OTROS -->
          <div class="space-y-2">
            <label class="text-xs font-bold uppercase tracking-wider text-slate-700">2. Clasificación del Envío</label>
            <div class="grid grid-cols-2 gap-3">
              <button
                type="button"
                class="flex flex-col items-start rounded-xl border p-3 text-left transition-all cursor-pointer"
                :class="formState.tipo_logistica === 'cirugia' ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20' : 'border-slate-200 bg-white hover:bg-slate-50'"
                @click="formState.tipo_logistica = 'cirugia'"
              >
                <div class="flex items-center gap-1.5">
                  <span class="font-bold text-xs text-slate-900">1. Logística de Cirugía</span>
                  <span v-if="formState.tipo_logistica === 'cirugia'" class="rounded-full bg-indigo-600 p-0.5 text-white"><CheckIcon class="h-3 w-3" /></span>
                </div>
                <span class="text-[11px] text-slate-500 mt-0.5">Requiere Cliente y Paciente. (Prov. auto: LOGISTICA CIRUGIA)</span>
              </button>

              <button
                type="button"
                class="flex flex-col items-start rounded-xl border p-3 text-left transition-all cursor-pointer"
                :class="formState.tipo_logistica === 'proveedor_otros' ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20' : 'border-slate-200 bg-white hover:bg-slate-50'"
                @click="formState.tipo_logistica = 'proveedor_otros'"
              >
                <div class="flex items-center gap-1.5">
                  <span class="font-bold text-xs text-slate-900">2. Proveedor / Otros</span>
                  <span v-if="formState.tipo_logistica === 'proveedor_otros'" class="rounded-full bg-indigo-600 p-0.5 text-white"><CheckIcon class="h-3 w-3" /></span>
                </div>
                <span class="text-[11px] text-slate-500 mt-0.5">Requiere Proveedor vinculado.</span>
              </button>
            </div>
          </div>

          <!-- CAMPOS OPERATIVOS DE TRANSPORTE Y REFERENCIAS -->
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="field-label">Empresa de Transporte <span class="text-rose-500">*</span></label>
              <v-select
                v-model="formState.transporte_id"
                :options="transportesOptions"
                :reduce="o => (o.code !== undefined ? o.code : o.value)"
                :loading="loadingOptions"
                taggable
                :create-option="handleCreateTransporte"
                placeholder="Seleccionar o crear transporte..."
                class="v-select-filter"
              />
            </div>

            <div>
              <label class="field-label">Fecha del Movimiento</label>
              <input v-model="formState.fecha_gasto" type="date" required class="form-input text-xs" />
            </div>

            <div class="sm:col-span-2">
              <label class="field-label">Descripción Operativa</label>
              <input
                v-model="formState.descripcion_general"
                type="text"
                class="form-input text-xs"
                placeholder="Ej: ENCOMIENDA FORMOSA PTE HIDALGO RAMON DOLORES"
              />

              <div v-if="sugerencias.hasSuggestions" class="mt-1.5 flex flex-wrap items-center gap-1 rounded-lg border border-indigo-100 bg-indigo-50/50 p-2 text-xs">
                <span class="font-bold text-indigo-900">Sugerencias:</span>
                <button v-if="sugerencias.tipo_logistica" type="button" class="suggestion-chip" @click="aplicarSugerencia('tipo_logistica', sugerencias.tipo_logistica)">Modo: Cirugía</button>
                <button v-if="sugerencias.paciente_referido" type="button" class="suggestion-chip" @click="aplicarSugerencia('paciente_referido', sugerencias.paciente_referido)">Paciente: {{ sugerencias.paciente_referido }}</button>
                <button v-if="sugerencias.cliente_sugerido" type="button" class="suggestion-chip" @click="aplicarSugerencia('cliente_sugerido', sugerencias.cliente_sugerido)">Cliente: {{ sugerencias.cliente_sugerido.label }}</button>
              </div>
            </div>

            <!-- SI ES CIRUGÍA -->
            <template v-if="formState.tipo_logistica === 'cirugia'">
              <div>
                <label class="field-label">Cliente / Obra Social <span class="text-rose-500">*</span></label>
                <v-select
                  v-model="formState.cliente_id"
                  :options="clientesOptions"
                  :reduce="o => (o.code !== undefined ? o.code : o.value)"
                  :loading="loadingOptions"
                  taggable
                  :create-option="handleCreateCliente"
                  placeholder="Seleccionar o escribir cliente..."
                  class="v-select-filter"
                />
              </div>

              <div>
                <label class="field-label">Paciente Referido <span class="text-rose-500">*</span></label>
                <input v-model="formState.paciente_referido" type="text" class="form-input text-xs" placeholder="Nombre completo del paciente" />
              </div>
            </template>

            <!-- SI ES PROVEEDOR / OTROS -->
            <template v-else>
              <div class="sm:col-span-2">
                <label class="field-label">Proveedor Vinculado <span class="text-rose-500">*</span></label>
                <v-select
                  v-model="formState.proveedor_id"
                  :options="proveedoresOptions"
                  :reduce="o => (o.code !== undefined ? o.code : o.value)"
                  :loading="loadingOptions"
                  taggable
                  :create-option="handleCreateProveedor"
                  placeholder="Seleccionar o crear proveedor..."
                  class="v-select-filter"
                />
              </div>
            </template>

            <div class="sm:col-span-2">
              <label class="field-label">Destino (Localidad / Provincia)</label>
              <DestinoSelect
                v-model:provinciaId="formState.provincia_id"
                v-model:localidadId="formState.localidad_destino_id"
              />
            </div>

            <div>
              <label class="field-label">N° de Guía / Remito</label>
              <input v-model="formState.numero_guia" type="text" class="form-input text-xs" placeholder="Ej: 09-3004 / Recibo 92138" />
            </div>
          </div>

          <!-- BOTONES DE ACCIÓN FINAL -->
          <div class="flex items-center justify-between border-t border-slate-100 pt-4">
            <button type="button" class="btn-secondary text-xs py-2 px-4" @click="cerrarModal" :disabled="saving">
              Cancelar
            </button>

            <button type="submit" class="btn-primary text-xs py-2.5 px-6 inline-flex items-center gap-2" :disabled="saving">
              <CubeIcon class="h-4 w-4" />
              <span>{{ saving ? 'Guardando...' : '🚀 Registrar Bultos' }}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </transition>
</template>
