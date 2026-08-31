<script setup>
import { computed, ref, watch } from 'vue';
import { supabase } from '../../supabaseClient';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { useLogisticaPdfExportVariants } from '../../composables/useLogisticaPdfExportVariants.js';
import { normalizeProveedor, normalizeTransporte, getProveedorBadgeColor } from '../../utils/logisticaHelpers.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'show-notification']);

const selectedMonth = ref(''); // Formato 'YYYY-MM' (Mes de vencimiento)
const includePagoInmediato = ref(true);
const includePieCharts = ref(true);
const activeViewTab = ref('encomienda'); // 'encomienda' | 'proveedor' | 'completo' | 'detalle'
const loading = ref(false);
const items = ref([]);

// Inicializar con el mes siguiente
const initMonth = () => {
  const today = new Date();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const year = nextMonth.getFullYear();
  const month = String(nextMonth.getMonth() + 1).padStart(2, '0');
  selectedMonth.value = `${year}-${month}`;
};

initMonth();

// Calcular el período de origen (mes anterior al seleccionado)
const originPeriod = computed(() => {
  if (!selectedMonth.value) return null;
  const [year, month] = selectedMonth.value.split('-').map(Number);
  const originDate = new Date(year, month - 2, 1);
  const startYear = originDate.getFullYear();
  const startMonth = String(originDate.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(startYear, originDate.getMonth() + 1, 0).getDate();
  
  return {
    start: `${startYear}-${startMonth}-01`,
    end: `${startYear}-${startMonth}-${String(lastDay).padStart(2, '0')}`,
    label: originDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
    vencimientoLabel: new Date(year, month - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
  };
});

const isSurgeryDescription = (desc) => {
  if (!desc) return false;
  const normalized = String(desc)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  return normalized.includes('cirugia') || normalized.includes('cirugía');
};

const loadCtaCteExpenses = async () => {
  if (!originPeriod.value) return;
  loading.value = true;
  try {
    let query = supabase
      .from('gastos')
      .select('*')
      .gte('fecha_gasto', originPeriod.value.start)
      .lte('fecha_gasto', originPeriod.value.end)
      .order('fecha_gasto', { ascending: true });

    if (!includePagoInmediato.value) {
      query = query.eq('origen_gasto', 'cuenta_corriente_empresa');
    }

    const [gastosRes, transportesRes, proveedoresRes, provinciasRes, localidadesRes, tiposRes] = await Promise.all([
      query,
      supabase.from('transportes').select('id, nombre'),
      supabase.from('proveedores').select('id, nombre'),
      supabase.from('provincias').select('id, nombre'),
      supabase.from('localidades').select('id, nombre'),
      supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto')
    ]);

    if (gastosRes.error) throw gastosRes.error;
    const data = gastosRes.data || [];
    const transportesList = transportesRes.data || [];
    const proveedoresList = proveedoresRes.data || [];
    const provinciasList = provinciasRes.data || [];
    const localidadesList = localidadesRes.data || [];
    const tiposList = tiposRes.data || [];

    const transportesMap = new Map(transportesList.map(t => [t.id, t]));
    const proveedoresMap = new Map(proveedoresList.map(p => [p.id, p]));
    const provinciasMap = new Map(provinciasList.map(p => [p.id, p]));
    const localidadesMap = new Map(localidadesList.map(l => [l.id, l]));
    const tiposMap = new Map(tiposList.map(t => [t.id, t.nombre_tipo_gasto]));

    // Filtrar estrictamente para incluir solo gastos que correspondan al módulo de Logística (Envíos | Devoluciones)
    const filteredData = data.filter(item => {
      const extra = item.datos_adicionales || {};
      const tipoNombre = (tiposMap.get(item.tipo_gasto_id) || '').toLowerCase();

      const isLogistica = (
        item.transporte_id != null ||
        item.tipo_gasto_id === 22 ||
        extra.modulo === 'logistica' ||
        extra.origen_carga === 'encomiendas_carga_multiple' ||
        tipoNombre.includes('envio') ||
        tipoNombre.includes('envío') ||
        tipoNombre.includes('devolucion') ||
        tipoNombre.includes('devolución') ||
        tipoNombre.includes('logistica') ||
        tipoNombre.includes('logística') ||
        tipoNombre.includes('despacho') ||
        tipoNombre.includes('encomienda')
      );

      if (!isLogistica) return false;

      if (!includePagoInmediato.value) {
        return item.origen_gasto === 'cuenta_corriente_empresa';
      }

      return true;
    });

    // Mapear y autodetectar empresas de transporte y cirugías en la descripción
    items.value = filteredData.map(item => {
      let t = item.transporte_id ? transportesMap.get(item.transporte_id) : null;
      let p = item.proveedor_id ? proveedoresMap.get(item.proveedor_id) : null;
      let prov = item.provincia_id ? provinciasMap.get(item.provincia_id) : null;
      let loc = item.localidad_destino_id ? localidadesMap.get(item.localidad_destino_id) : null;

      const desc = item.descripcion_general || '';
      const descUpper = desc.toUpperCase();

      // Si no tiene transporte en la relación pero figura en la descripción, autodetectarlo
      if (!t && transportesList.length > 0) {
        const matched = transportesList.find(tr => tr.nombre && tr.nombre.length > 2 && descUpper.includes(tr.nombre.toUpperCase()));
        if (matched) {
          t = { id: matched.id, nombre: matched.nombre };
        }
      }

      const isSinProv = !p || p.id === 4 || (p.nombre || '').toLowerCase() === 'sin proveedor';
      const finalProv = (isSinProv && isSurgeryDescription(desc))
        ? { id: 14, nombre: 'LOGISTICA CIRUGIA' }
        : p;

      return {
        ...item,
        transporte: t,
        proveedor: finalProv,
        provincias: prov,
        localidad_destino: loc
      };
    });
  } catch (e) {
    console.error('Error cargando vencimientos de cuenta corriente:', e);
    emit('show-notification', 'Error', 'No se pudieron cargar los datos de vencimientos.', 'error');
    items.value = [];
  } finally {
    loading.value = false;
  }
};

const totalAmount = computed(() => {
  return items.value.reduce((total, item) => total + Number(item.monto_total || 0), 0);
});

const totalCtaCte = computed(() => {
  return items.value.reduce((acc, item) => {
    return acc + (item.origen_gasto === 'cuenta_corriente_empresa' ? Number(item.monto_total || 0) : 0);
  }, 0);
});

const totalPagoDirecto = computed(() => {
  return items.value.reduce((acc, item) => {
    return acc + (item.origen_gasto !== 'cuenta_corriente_empresa' ? Number(item.monto_total || 0) : 0);
  }, 0);
});

const getBultosCount = (item) => {
  const extra = item.datos_adicionales || {};
  const b = extra.cantidad_bultos;
  if (b !== undefined && b !== null && b !== '') {
    const num = Number(b);
    if (!isNaN(num) && num > 0) return num;
  }
  return 1;
};

const totalBultos = computed(() => {
  return items.value.reduce((acc, item) => acc + getBultosCount(item), 0);
});

const resumenPorEncomienda = computed(() => {
  const map = {};
  items.value.forEach(item => {
    const rawName = item.transporte?.nombre || 'LOGISTICA CIRUGIA';
    const name = normalizeTransporte(rawName);
    if (!map[name]) {
      map[name] = { nombre: name, cantOps: 0, bultos: 0, ctaCte: 0, pagoDirecto: 0, total: 0, zonasMap: {} };
    }
    const val = Number(item.monto_total || 0);
    const bCount = getBultosCount(item);
    map[name].cantOps += 1;
    map[name].bultos += bCount;
    if (item.origen_gasto === 'cuenta_corriente_empresa') {
      map[name].ctaCte += val;
    } else {
      map[name].pagoDirecto += val;
    }
    map[name].total += val;

    const extra = item.datos_adicionales || {};
    const dest = (extra.destino_texto || item.localidad_destino?.nombre || item.provincias?.nombre || '').trim();
    if (dest && !dest.toLowerCase().includes('sin destino') && !dest.toLowerCase().includes('sin provincia')) {
      map[name].zonasMap[dest] = (map[name].zonasMap[dest] || 0) + 1;
    }
  });

  return Object.values(map).map(e => {
    let topZ = '—';
    let maxC = 0;
    for (const [z, count] of Object.entries(e.zonasMap || {})) {
      if (count > maxC) {
        maxC = count;
        topZ = z;
      }
    }
    return { ...e, zonaConcurrida: topZ };
  }).sort((a, b) => b.total - a.total);
});

const resumenPorProveedor = computed(() => {
  const map = {};
  items.value.forEach(item => {
    const rawName = item.proveedor?.nombre;
    const name = normalizeProveedor(rawName);
    if (!map[name]) {
      map[name] = { nombre: name, cantOps: 0, bultos: 0, ctaCte: 0, pagoDirecto: 0, total: 0 };
    }
    const val = Number(item.monto_total || 0);
    const bCount = getBultosCount(item);
    map[name].cantOps += 1;
    map[name].bultos += bCount;
    if (item.origen_gasto === 'cuenta_corriente_empresa') {
      map[name].ctaCte += val;
    } else {
      map[name].pagoDirecto += val;
    }
    map[name].total += val;
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
});

const getOrigenBadge = (item) => {
  if (item.origen_gasto === 'cuenta_corriente_empresa') {
    return { text: 'Cta. Corriente', class: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
  }
  if (item.origen_gasto === 'rendicion' || item.viaje_id) {
    return { text: 'Rendición Viaje', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  return { text: 'Caja Chica / Pago Dir.', class: 'bg-amber-50 text-amber-700 border-amber-200' };
};

const closeModal = () => {
  emit('update:modelValue', false);
};

const { exportarPdfCtaCteVencimientos } = useLogisticaPdfExportVariants();

const downloadPDF = (modoOverride = null) => {
  if (items.value.length === 0) return;
  
  const targetMode = modoOverride || activeViewTab.value;
  try {
    exportarPdfCtaCteVencimientos(items.value, {
      vencimientoLabel: originPeriod.value?.vencimientoLabel,
      originLabel: originPeriod.value?.label,
      selectedMonth: selectedMonth.value,
      includePagoInmediato: includePagoInmediato.value,
      includePieCharts: includePieCharts.value,
      modoReporte: targetMode
    });
    
    let modeLabel = 'consolidado';
    if (targetMode === 'encomienda') modeLabel = 'por encomiendas';
    else if (targetMode === 'proveedor') modeLabel = 'por proveedores';
    else if (targetMode === 'completo') modeLabel = 'consolidado completo';
    
    emit('show-notification', 'PDF descargado', `El reporte ${modeLabel} fue generado y descargado.`, 'success');
  } catch (e) {
    console.error('Error generando PDF de vencimientos:', e);
    emit('show-notification', 'Error', 'No se pudo generar el reporte en PDF.', 'error');
  }
};

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    initMonth();
    loadCtaCteExpenses();
  }
});

watch([selectedMonth, includePagoInmediato], () => {
  loadCtaCteExpenses();
});
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="modelValue" class="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/70 p-3 sm:p-6" @click.self="closeModal">
      <div class="flex max-h-[94vh] w-full max-w-[94vw] xl:max-w-7xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
        
        <!-- Header -->
        <div class="flex items-start justify-between border-b border-slate-200 p-5 bg-slate-50">
          <div>
            <h3 class="text-lg font-bold text-slate-900 flex items-center gap-2">
              <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Libro Mayor de Cuenta Corriente — Vencimientos y Consolidación
            </h3>
            <p class="mt-1 text-xs font-medium text-slate-500">
              Visualiza y descarga el detalle de gastos acumulados por encomienda y proveedor.
            </p>
          </div>
          <button type="button" class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors" @click="closeModal">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Contenido principal -->
        <div class="flex-grow overflow-y-auto p-6 space-y-6">
          
          <!-- Filtro de mes y Checkbox Consolidación & Gráficos -->
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center bg-slate-50/80 p-4 border border-slate-200 rounded-xl">
            <div class="lg:col-span-3">
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Mes de Vencimiento</label>
              <input v-model="selectedMonth" type="month" class="form-input" />
            </div>
            
            <div class="lg:col-span-6 flex flex-wrap items-center gap-4 pt-2 lg:pt-5">
              <label class="relative flex items-center gap-2 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  v-model="includePagoInmediato"
                  class="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                />
                <span class="text-xs font-semibold text-slate-700">
                  Consolidar pagos inmediatos <span class="text-slate-500 font-normal">(Rend./Cajas)</span>
                </span>
              </label>

              <label class="relative flex items-center gap-2 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  v-model="includePieCharts"
                  class="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                />
                <span class="text-xs font-semibold text-indigo-700 flex items-center gap-1">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                  </svg>
                  Incluir Gráficos Torta en PDF
                </span>
              </label>
            </div>

            <div class="lg:col-span-3 lg:text-right pt-2 lg:pt-5" v-if="originPeriod">
              <p class="text-xs font-medium text-slate-500">
                Origen de gastos: <span class="text-indigo-600 font-bold capitalize">{{ originPeriod.label }}</span>
              </p>
            </div>
          </div>

          <!-- Spinner o vacío -->
          <div v-if="loading" class="flex flex-col items-center justify-center py-12">
            <svg class="animate-spin h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span class="mt-3 text-sm text-slate-500">Cargando vencimientos de cuenta corriente y operaciones...</span>
          </div>

          <div v-else-if="items.length === 0" class="rounded-xl border-2 border-dashed border-slate-200 py-12 text-center">
            <p class="text-sm font-semibold text-slate-500">Sin operaciones registradas en el período seleccionado.</p>
          </div>

          <!-- Panel de datos -->
          <div v-else class="space-y-5">
            
            <!-- Resumen de tarjetas KPI -->
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div class="rounded-xl border border-slate-200 p-3.5 bg-white shadow-xs">
                <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Consolidado</span>
                <strong class="mt-1 block text-lg font-extrabold text-indigo-700">{{ formatCurrency(totalAmount) }}</strong>
              </div>
              <div class="rounded-xl border border-slate-200 p-3.5 bg-white shadow-xs">
                <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">En Cuenta Corriente</span>
                <strong class="mt-1 block text-lg font-bold text-slate-800">{{ formatCurrency(totalCtaCte) }}</strong>
              </div>
              <div class="rounded-xl border border-slate-200 p-3.5 bg-white shadow-xs">
                <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">En Pago Directo</span>
                <strong class="mt-1 block text-lg font-bold text-emerald-600">{{ formatCurrency(totalPagoDirecto) }}</strong>
              </div>
              <div class="rounded-xl border border-slate-200 p-3.5 bg-white shadow-xs">
                <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Bultos</span>
                <strong class="mt-1 block text-lg font-bold text-slate-900">{{ totalBultos }} bultos <span class="text-xs font-normal text-slate-500">({{ items.length }} despachos)</span></strong>
              </div>
            </div>

            <!-- Selector de Vistas / Pestañas internas -->
            <div class="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
              <button 
                type="button" 
                @click="activeViewTab = 'encomienda'"
                :class="[
                  'px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5',
                  activeViewTab === 'encomienda' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                ]"
              >
                <span>Por Encomienda / Transporte</span>
                <span class="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-mono" v-if="activeViewTab === 'encomienda'">{{ resumenPorEncomienda.length }}</span>
              </button>

              <button 
                type="button" 
                @click="activeViewTab = 'proveedor'"
                :class="[
                  'px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5',
                  activeViewTab === 'proveedor' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                ]"
              >
                <span>Por Proveedor</span>
                <span class="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-mono" v-if="activeViewTab === 'proveedor'">{{ resumenPorProveedor.length }}</span>
              </button>

              <button 
                type="button" 
                @click="activeViewTab = 'completo'"
                :class="[
                  'px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5',
                  activeViewTab === 'completo' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                ]"
              >
                <span>Consolidado Completo (Ambos)</span>
              </button>

              <button 
                type="button" 
                @click="activeViewTab = 'detalle'"
                :class="[
                  'px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5',
                  activeViewTab === 'detalle' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                ]"
              >
                <span>Detalle Completo</span>
                <span class="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-mono" v-if="activeViewTab === 'detalle'">{{ items.length }}</span>
              </button>
            </div>

            <!-- VISTA 1: TABLA RESUMEN POR ENCOMIENDA -->
            <div v-if="activeViewTab === 'encomienda'" class="rounded-xl border border-slate-200 overflow-hidden">
              <div class="overflow-x-auto max-h-[50vh]">
                <table class="min-w-full divide-y divide-slate-200">
                  <thead class="bg-slate-50 sticky top-0">
                    <tr>
                      <th class="px-3 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500 w-10">N°</th>
                      <th class="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Encomienda / Empresa Logística</th>
                      <th class="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Zona Concurrida</th>
                      <th class="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Bultos</th>
                      <th class="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500">% Participación</th>
                      <th class="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Cta. Corriente</th>
                      <th class="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Pago Directo</th>
                      <th class="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Total Consolidado</th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-slate-100 text-xs">
                    <tr v-for="(enc, idx) in resumenPorEncomienda" :key="enc.nombre" class="hover:bg-slate-50">
                      <td class="px-3 py-2.5 text-center font-bold text-slate-400 w-10">{{ idx + 1 }}</td>
                      <td class="px-4 py-2.5 font-bold">
                        <span class="inline-block px-2.5 py-0.5 text-xs font-bold rounded-full border" :class="getProveedorBadgeColor(enc.nombre)">
                          {{ enc.nombre }}
                        </span>
                      </td>
                      <td class="px-3 py-2.5 text-slate-600 font-medium truncate max-w-[130px]">{{ enc.zonaConcurrida }}</td>
                      <td class="px-4 py-2.5 text-center font-mono text-slate-900 font-bold">{{ enc.bultos }}</td>
                      <td class="px-4 py-2.5 text-center font-mono text-indigo-600 font-bold">{{ totalAmount > 0 ? ((enc.total / totalAmount) * 100).toFixed(1) + '%' : '0%' }}</td>
                      <td class="px-4 py-2.5 text-right font-medium text-slate-700">{{ formatCurrency(enc.ctaCte) }}</td>
                      <td class="px-4 py-2.5 text-right font-medium text-emerald-600">{{ formatCurrency(enc.pagoDirecto) }}</td>
                      <td class="px-4 py-2.5 text-right font-extrabold text-slate-900">{{ formatCurrency(enc.total) }}</td>
                    </tr>
                  </tbody>
                  <tfoot class="bg-slate-100 font-bold text-xs text-slate-900 border-t-2 border-slate-300">
                    <tr>
                      <td class="px-4 py-3" colspan="3">TOTAL CONSOLIDADO ({{ resumenPorEncomienda.length }} empresas)</td>
                      <td class="px-4 py-3 text-center font-mono font-extrabold text-indigo-700">{{ totalBultos }} bultos</td>
                      <td class="px-4 py-3 text-center font-mono text-indigo-700">100.0%</td>
                      <td class="px-4 py-3 text-right text-slate-800">{{ formatCurrency(totalCtaCte) }}</td>
                      <td class="px-4 py-3 text-right text-emerald-700">{{ formatCurrency(totalPagoDirecto) }}</td>
                      <td class="px-4 py-3 text-right text-indigo-700 text-sm font-extrabold">{{ formatCurrency(totalAmount) }}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <!-- VISTA 2: TABLA RESUMEN POR PROVEEDOR -->
            <div v-else-if="activeViewTab === 'proveedor'" class="rounded-xl border border-slate-200 overflow-hidden">
              <div class="overflow-x-auto max-h-[50vh]">
                <table class="min-w-full divide-y divide-slate-200">
                  <thead class="bg-slate-50 sticky top-0">
                    <tr>
                      <th class="px-3 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500 w-10">N°</th>
                      <th class="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Proveedor / Empresa</th>
                      <th class="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Bultos</th>
                      <th class="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500">% Participación</th>
                      <th class="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Cta. Corriente</th>
                      <th class="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Pago Directo</th>
                      <th class="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Total Consolidado</th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-slate-100 text-xs">
                    <tr v-for="(prov, idx) in resumenPorProveedor" :key="prov.nombre" class="hover:bg-slate-50">
                      <td class="px-3 py-2.5 text-center font-bold text-slate-400 w-10">{{ idx + 1 }}</td>
                      <td class="px-4 py-2.5 font-bold text-slate-800">{{ prov.nombre }}</td>
                      <td class="px-4 py-2.5 text-center font-mono text-slate-900 font-bold">{{ prov.bultos }}</td>
                      <td class="px-4 py-2.5 text-center font-mono text-indigo-600 font-bold">{{ totalAmount > 0 ? ((prov.total / totalAmount) * 100).toFixed(1) + '%' : '0%' }}</td>
                      <td class="px-4 py-2.5 text-right font-medium text-slate-700">{{ formatCurrency(prov.ctaCte) }}</td>
                      <td class="px-4 py-2.5 text-right font-medium text-emerald-600">{{ formatCurrency(prov.pagoDirecto) }}</td>
                      <td class="px-4 py-2.5 text-right font-extrabold text-slate-900">{{ formatCurrency(prov.total) }}</td>
                    </tr>
                  </tbody>
                  <tfoot class="bg-slate-100 font-bold text-xs text-slate-900 border-t-2 border-slate-300">
                    <tr>
                      <td class="px-4 py-3" colspan="2">TOTAL CONSOLIDADO ({{ resumenPorProveedor.length }} proveedores)</td>
                      <td class="px-4 py-3 text-center font-mono font-extrabold text-indigo-700">{{ totalBultos }} bultos</td>
                      <td class="px-4 py-3 text-center font-mono text-indigo-700">100.0%</td>
                      <td class="px-4 py-3 text-right text-slate-800">{{ formatCurrency(totalCtaCte) }}</td>
                      <td class="px-4 py-3 text-right text-emerald-700">{{ formatCurrency(totalPagoDirecto) }}</td>
                      <td class="px-4 py-3 text-right text-indigo-700 text-sm font-extrabold">{{ formatCurrency(totalAmount) }}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <!-- VISTA 3: VISTA COMPLETA (AMBOS RESÚMENES) -->
            <div v-else-if="activeViewTab === 'completo'" class="space-y-6">
              
              <!-- Resumen 1: Encomiendas -->
              <div>
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-indigo-600"></span>
                  1. Resumen por Encomienda / Operador Logístico
                </h4>
                <div class="rounded-xl border border-slate-200 overflow-hidden">
                  <div class="overflow-x-auto max-h-[25vh]">
                    <table class="min-w-full divide-y divide-slate-200">
                      <thead class="bg-slate-50 sticky top-0">
                        <tr>
                          <th class="px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-500 w-10">N°</th>
                          <th class="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Encomienda</th>
                          <th class="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Zona Concurrida</th>
                          <th class="px-4 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Bultos</th>
                          <th class="px-4 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-500">% Participación</th>
                          <th class="px-4 py-2 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Cta. Corriente</th>
                          <th class="px-4 py-2 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Pago Directo</th>
                          <th class="px-4 py-2 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Total Consolidado</th>
                        </tr>
                      </thead>
                      <tbody class="bg-white divide-y divide-slate-100 text-xs">
                        <tr v-for="(enc, idx) in resumenPorEncomienda" :key="enc.nombre" class="hover:bg-slate-50">
                          <td class="px-3 py-2 text-center font-bold text-slate-400 w-10">{{ idx + 1 }}</td>
                          <td class="px-4 py-2 font-bold text-slate-800">{{ enc.nombre }}</td>
                          <td class="px-3 py-2 text-slate-600 font-medium truncate max-w-[130px]">{{ enc.zonaConcurrida }}</td>
                          <td class="px-4 py-2 text-center font-mono text-slate-900 font-bold">{{ enc.bultos }}</td>
                          <td class="px-4 py-2 text-center font-mono text-indigo-600 font-bold">{{ totalAmount > 0 ? ((enc.total / totalAmount) * 100).toFixed(1) + '%' : '0%' }}</td>
                          <td class="px-4 py-2 text-right font-medium text-slate-700">{{ formatCurrency(enc.ctaCte) }}</td>
                          <td class="px-4 py-2 text-right font-medium text-emerald-600">{{ formatCurrency(enc.pagoDirecto) }}</td>
                          <td class="px-4 py-2 text-right font-extrabold text-slate-900">{{ formatCurrency(enc.total) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <!-- Resumen 2: Proveedores -->
              <div>
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-indigo-600"></span>
                  2. Resumen por Proveedor
                </h4>
                <div class="rounded-xl border border-slate-200 overflow-hidden">
                  <div class="overflow-x-auto max-h-[25vh]">
                    <table class="min-w-full divide-y divide-slate-200">
                      <thead class="bg-slate-50 sticky top-0">
                        <tr>
                          <th class="px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-500 w-10">N°</th>
                          <th class="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Proveedor</th>
                          <th class="px-4 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Bultos</th>
                          <th class="px-4 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-500">% Participación</th>
                          <th class="px-4 py-2 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Cta. Corriente</th>
                          <th class="px-4 py-2 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Pago Directo</th>
                          <th class="px-4 py-2 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Total Consolidado</th>
                        </tr>
                      </thead>
                      <tbody class="bg-white divide-y divide-slate-100 text-xs">
                        <tr v-for="(prov, idx) in resumenPorProveedor" :key="prov.nombre" class="hover:bg-slate-50">
                          <td class="px-3 py-2 text-center font-bold text-slate-400 w-10">{{ idx + 1 }}</td>
                          <td class="px-4 py-2 font-bold text-slate-800">{{ prov.nombre }}</td>
                          <td class="px-4 py-2 text-center font-mono text-slate-900 font-bold">{{ prov.bultos }}</td>
                          <td class="px-4 py-2 text-center font-mono text-indigo-600 font-bold">{{ totalAmount > 0 ? ((prov.total / totalAmount) * 100).toFixed(1) + '%' : '0%' }}</td>
                          <td class="px-4 py-2 text-right font-medium text-slate-700">{{ formatCurrency(prov.ctaCte) }}</td>
                          <td class="px-4 py-2 text-right font-medium text-emerald-600">{{ formatCurrency(prov.pagoDirecto) }}</td>
                          <td class="px-4 py-2 text-right font-extrabold text-slate-900">{{ formatCurrency(prov.total) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            </div>

            <!-- VISTA 4: TABLA DETALLE COMPLETO -->
            <div v-else class="rounded-xl border border-slate-200 overflow-hidden">
              <div class="overflow-x-auto max-h-[50vh]">
                <table class="min-w-full divide-y divide-slate-200">
                  <thead class="bg-slate-50 sticky top-0">
                    <tr>
                      <th class="px-3 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500 w-10">N°</th>
                      <th class="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Fecha</th>
                      <th class="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Encomienda</th>
                      <th class="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Proveedor</th>
                      <th class="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Detalle</th>
                      <th class="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Bultos</th>
                      <th class="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Factura</th>
                      <th class="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Origen</th>
                      <th class="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Monto</th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-slate-100 text-xs">
                    <tr v-for="(item, idx) in items" :key="item.id" class="hover:bg-slate-50">
                      <td class="px-3 py-2.5 text-center font-bold text-slate-400 w-10">{{ idx + 1 }}</td>
                      <td class="px-4 py-2.5 whitespace-nowrap text-slate-600">{{ formatDate(item.fecha_gasto) }}</td>
                      <td class="px-4 py-2.5 font-semibold text-slate-800">{{ item.transporte?.nombre || 'N/A' }}</td>
                      <td class="px-4 py-2.5 text-slate-700">{{ item.proveedor?.nombre || 'SIN PROVEEDOR' }}</td>
                      <td class="px-4 py-2.5 text-slate-500 truncate max-w-xs">{{ item.descripcion_general || 'Pago de encomienda' }}</td>
                      <td class="px-4 py-2.5 text-center font-mono font-bold text-indigo-700">{{ getBultosCount(item) }}</td>
                      <td class="px-4 py-2.5 text-center text-slate-600 font-mono">{{ item.numero_factura || '—' }}</td>
                      <td class="px-4 py-2.5 text-center">
                        <span :class="['px-2 py-0.5 rounded-md text-[10px] font-bold border', getOrigenBadge(item).class]">
                          {{ getOrigenBadge(item).text }}
                        </span>
                      </td>
                      <td class="px-4 py-2.5 text-right font-bold text-slate-900">{{ formatCurrency(item.monto_total) }}</td>
                    </tr>
                  </tbody>
                  <tfoot class="bg-slate-100 font-bold text-xs text-slate-900 border-t-2 border-slate-300">
                    <tr>
                      <td class="px-4 py-3" colspan="2">TOTAL DETALLE ({{ items.length }} registros)</td>
                      <td class="px-4 py-3" colspan="3"></td>
                      <td class="px-4 py-3 text-center font-mono font-extrabold text-indigo-700">{{ totalBultos }} bultos</td>
                      <td class="px-4 py-3" colspan="2"></td>
                      <td class="px-4 py-3 text-right text-indigo-700 text-sm font-extrabold">{{ formatCurrency(totalAmount) }}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

          </div>
        </div>

        <!-- Footer con Botones de Exportación Dinámica -->
        <div class="border-t border-slate-200 p-4 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-slate-500">Descargas Rápidas:</span>
            <button 
              type="button" 
              class="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100"
              @click="downloadPDF('encomienda')"
              :disabled="items.length === 0 || loading"
            >
              PDF Solo Encomiendas
            </button>
            <button 
              type="button" 
              class="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100"
              @click="downloadPDF('proveedor')"
              :disabled="items.length === 0 || loading"
            >
              PDF Solo Proveedores
            </button>
            <button 
              type="button" 
              class="px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100"
              @click="downloadPDF('completo')"
              :disabled="items.length === 0 || loading"
            >
              PDF Consolidado Completo (Ambos)
            </button>
          </div>

          <div class="flex items-center gap-3">
            <button type="button" class="btn-secondary" @click="closeModal">Cerrar</button>
            <button 
              type="button" 
              class="btn-primary flex items-center justify-center gap-2" 
              :disabled="items.length === 0 || loading"
              @click="downloadPDF(null)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>
                {{ activeViewTab === 'encomienda' ? 'Descargar PDF (Solo Encomiendas)' : activeViewTab === 'proveedor' ? 'Descargar PDF (Solo Proveedores)' : activeViewTab === 'completo' ? 'Descargar PDF (Consolidado Completo)' : 'Descargar PDF (Detalle)' }}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.form-input { @apply block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm; }
.btn-primary { @apply rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50; }
.btn-secondary { @apply rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50; }
.z-60 { z-index: 60; }
.modal-fade-enter-active,
.modal-fade-leave-active { transition: opacity 0.2s ease; }
.modal-fade-enter-from,
.modal-fade-leave-to { opacity: 0; }
</style>
