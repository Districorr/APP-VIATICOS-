<!-- src/views/admin/AdminAnalyticsView.vue -->
<script setup>
import { ref, onMounted, computed, watch, nextTick } from 'vue';
import { supabase } from '../../supabaseClient';
import { formatCurrency, formatDate } from '../../utils/formatters.js';
import { Line as LineChart, Bar, Doughnut, getElementAtEvent } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, PointElement, LineElement, Filler, TimeScale, ArcElement } from 'chart.js';
import { useRouter } from 'vue-router';
import { useExcelExporter } from '../../composables/useExcelExporter';

import ToastNotification from '../../components/ToastNotification.vue';
import StatCard from '../../components/admin/StatCard.vue';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';
import { ChartPieIcon, MagnifyingGlassIcon, ArrowDownTrayIcon, BriefcaseIcon } from '@heroicons/vue/24/outline';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, PointElement, LineElement, Filler, TimeScale, ArcElement);
const router = useRouter();
const { exportToExcel } = useExcelExporter();

// --- ESTADO GENERAL ---
const activeTab = ref('gastos'); // gastos, rendiciones, exploracion
const loading = ref({
  dashboardGastos: true,
  exploration: false,
  tipoGastoOptions: true,
  dashboardRendiciones: true,
  perfilesOptions: true
});
const error = ref({
  dashboardGastos: '',
  exploration: '',
  dashboardRendiciones: ''
});
const notification = ref({});
const showNotification = (title, message, type = 'info') => {
  notification.value = { title, message, type, timestamp: new Date() };
};

// --- PESTAÑA: ANÁLISIS DE GASTOS ---
const gastosDashboardData = ref(null);
const gastosSelectedPeriod = ref('30d');
const gastosGlobalTipoGastoFilter = ref([]);
const gastosTipoGastoOptions = ref([]);
const gastosDoughnutChartRef = ref(null);
const gastosHoveredSliceIndex = ref(null);
const gastosPeriodOptions = [ { label: 'Últimos 7 días', value: '7d' }, { label: 'Últimos 30 días', value: '30d' }, { label: 'Este Mes', value: 'this_month' }, { label: 'Mes Pasado', value: 'last_month' }];

// --- PESTAÑA: ANÁLISIS DE RENDICIONES (NUEVO) ---
const rendicionesDashboardData = ref(null);
const rendicionesFilters = ref({
  fechaDesde: new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().split('T')[0],
  fechaHasta: new Date().toISOString().split('T')[0],
  responsableId: null,
});
const perfilesOptions = ref([]);

// --- PESTAÑA: EXPLORACIÓN AVANZADA ---
const explorationFilters = ref({
  clienteId: null,
  transporteId: null,
  tipoGastoId: null,
  provincia: null,
  paciente: '',
  fechaDesde: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
  fechaHasta: new Date().toISOString().split('T')[0],
});
const explorationGastosFiltrados = ref([]);
const explorationOptions = ref({
  clientes: [],
  transportes: [],
  tiposGasto: [],
  provincias: [],
});

// --- LÓGICA DE CARGA DE DATOS ---
const gastosDateRange = computed(() => {
  const end = new Date();
  let start = new Date();
  switch (gastosSelectedPeriod.value) {
    case '7d': start.setDate(end.getDate() - 7); break;
    case 'this_month': start = new Date(end.getFullYear(), end.getMonth(), 1); break;
    case 'last_month': end = new Date(end.getFullYear(), end.getMonth(), 0); start = new Date(end.getFullYear(), end.getMonth(), 1); break;
    default: start.setDate(end.getDate() - 30);
  }
  return { p_start_date: start.toISOString().split('T')[0], p_end_date: end.toISOString().split('T')[0] };
});

async function fetchGastosDashboardData() {
  loading.value.dashboardGastos = true;
  error.value.dashboardGastos = '';
  try {
    const params = {
      ...gastosDateRange.value,
      p_tipo_gasto_ids: gastosGlobalTipoGastoFilter.value.length > 0 ? gastosGlobalTipoGastoFilter.value.map(f => f.code) : null
    };
    const { data, error: rpcError } = await supabase.rpc('get_admin_strategic_overview', params);
    if (rpcError) throw rpcError;
    gastosDashboardData.value = data;
  } catch (e) {
    console.error("Error al cargar el dashboard de gastos:", e);
    error.value.dashboardGastos = `Error al cargar el dashboard de gastos: ${e.message}`;
  } finally {
    loading.value.dashboardGastos = false;
  }
}

async function fetchTipoGastoOptions() {
  loading.value.tipoGastoOptions = true;
  try {
    const { data, error } = await supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto').order('nombre_tipo_gasto');
    if (error) throw error;
    gastosTipoGastoOptions.value = data.map(t => ({ label: t.nombre_tipo_gasto, code: t.id }));
    explorationOptions.value.tiposGasto = gastosTipoGastoOptions.value;
  } catch(e) { console.error("Error cargando opciones de tipo de gasto:", e); }
  finally { loading.value.tipoGastoOptions = false; }
}

async function applyExplorationFilters() {
    loading.value.exploration = true;
    error.value.exploration = '';
    try {
        const params = {
            p_cliente_id: explorationFilters.value.clienteId?.code || null,
            p_transporte_id: explorationFilters.value.transporteId?.code || null,
            p_tipo_gasto_id: explorationFilters.value.tipoGastoId?.code || null,
            p_provincia: explorationFilters.value.provincia || null,
            p_paciente: explorationFilters.value.paciente || null,
            p_fecha_desde: explorationFilters.value.fechaDesde || null,
            p_fecha_hasta: explorationFilters.value.fechaHasta || null,
        };
        const { data, error: rpcError } = await supabase.rpc('filtrar_gastos_admin', params);
        if (rpcError) throw rpcError;
        explorationGastosFiltrados.value = data || [];
    } catch (e) {
        error.value.exploration = `Error al buscar datos: ${e.message}`;
    } finally {
        loading.value.exploration = false;
    }
}

async function fetchExplorationOptions() {
    if (explorationOptions.value.clientes.length > 0) return;
    try {
      const [clientesRes, transportesRes, provinciasRes] = await Promise.all([
          supabase.from('clientes').select('id, nombre_cliente').order('nombre_cliente'),
          supabase.from('transportes').select('id, nombre').order('nombre'),
          supabase.rpc('get_provincias_unicas_gastos')
      ]);
      if (clientesRes.error) throw clientesRes.error;
      explorationOptions.value.clientes = clientesRes.data.map(c => ({ label: c.nombre_cliente, code: c.id }));
      if (transportesRes.error) throw transportesRes.error;
      explorationOptions.value.transportes = transportesRes.data.map(t => ({ label: t.nombre, code: t.id }));
      if (provinciasRes.error) throw provinciasRes.error;
      explorationOptions.value.provincias = provinciasRes.data.map(p => p.provincia).filter(Boolean);
    } catch(e) {
      console.error("Error cargando opciones de exploración:", e);
      error.value.exploration = "No se pudieron cargar las opciones de filtro.";
    }
}

async function fetchPerfilesOptions() {
  loading.value.perfilesOptions = true;
  try {
    const { data, error } = await supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo');
    if (error) throw error;
    perfilesOptions.value = data.map(p => ({ label: p.nombre_completo, code: p.id }));
  } catch(e) { console.error("Error cargando perfiles:", e); }
  finally { loading.value.perfilesOptions = false; }
}

async function fetchRendicionesDashboardData() {
  loading.value.dashboardRendiciones = true;
  error.value.dashboardRendiciones = '';
  try {
    const params = {
      p_start_date: rendicionesFilters.value.fechaDesde,
      p_end_date: rendicionesFilters.value.fechaHasta,
      p_user_id: rendicionesFilters.value.responsableId?.code || null
    };
    const { data, error: rpcError } = await supabase.rpc('get_dashboard_analisis_rendiciones', params);
    if (rpcError) throw rpcError;
    rendicionesDashboardData.value = data;
  } catch(e) {
    console.error("Error al cargar análisis de rendiciones:", e);
    error.value.dashboardRendiciones = `Error al cargar análisis de rendiciones: ${e.message}`;
  } finally {
    loading.value.dashboardRendiciones = false;
  }
}

// --- LÓGICA DE INTERACTIVIDAD ---
async function drillDown(filterType, value) {
  activeTab.value = 'exploracion';
  await nextTick();
  await fetchExplorationOptions();
  
  if (filterType === 'tipoGasto') {
    const option = gastosTipoGastoOptions.value.find(o => o.code === value);
    if (option) explorationFilters.value.tipoGastoId = option;
  }
  document.getElementById('exploration-content')?.scrollIntoView({ behavior: 'smooth' });
}

function handleDoughnutClick(event) {
  const chart = gastosDoughnutChartRef.value?.chart;
  if (!chart) return;
  const points = getElementAtEvent(chart, event);
  if (points.length) {
    const pointIndex = points[0].index;
    const tipoGastoId = gastosDashboardData.value.charts.desglose_tipo[pointIndex]?.tipo_gasto_id;
    if (tipoGastoId) {
      drillDown('tipoGasto', tipoGastoId);
    }
  }
}

// --- COMPUTED PROPERTIES ---
const chartColors = ['#3b82f6', '#10b981', '#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#64748b'];
const gastosKPIs = computed(() => gastosDashboardData.value?.kpis);
const gastosTotalDesglose = computed(() => gastosDashboardData.value?.charts?.desglose_tipo.reduce((sum, item) => sum + parseFloat(item.total), 0) || 0);

const gastosDesgloseTipoData = computed(() => {
  if (!gastosDashboardData.value?.charts?.desglose_tipo) return null;
  const data = gastosDashboardData.value.charts.desglose_tipo;
  const backgroundColors = data.map((_, index) => gastosHoveredSliceIndex.value === null ? chartColors[index % chartColors.length] : (index === gastosHoveredSliceIndex.value ? chartColors[index % chartColors.length] : `${chartColors[index % chartColors.length]}40`));
  return { labels: data.map(item => item.tipo), datasets: [{ data: data.map(item => item.total), backgroundColor: backgroundColors, borderWidth: 0 }] };
});

const gastosProcessedEvolutionData = computed(() => {
    if (!gastosDashboardData.value?.charts?.evolucion_origen) return null;
    const sourceData = gastosDashboardData.value.charts.evolucion_origen;
    return {
      labels: sourceData.map(item => formatDate(item.mes, { month: 'short', year: '2-digit' })),
      datasets: [
        { label: 'Viaje/Rendición', data: sourceData.map(i => i.total_viaje), borderColor: chartColors[0], backgroundColor: `${chartColors[0]}1A`, fill: true, tension: 0.4 },
        { label: 'Caja Chica', data: sourceData.map(i => i.total_caja), borderColor: chartColors[1], backgroundColor: `${chartColors[1]}1A`, fill: true, tension: 0.4 },
      ]
    };
});

const rendicionesKPIs = computed(() => rendicionesDashboardData.value?.kpis);

const rendicionesEvolucionData = computed(() => {
    if (!rendicionesDashboardData.value?.charts?.evolucion_costo) return null;
    const sourceData = rendicionesDashboardData.value.charts.evolucion_costo;
    return {
      labels: sourceData.map(item => formatDate(item.mes, { month: 'short', year: '2-digit' })),
      datasets: [{ label: 'Costo Total de Rendiciones', data: sourceData.map(i => i.total), borderColor: chartColors[0], backgroundColor: `${chartColors[0]}1A`, fill: true, tension: 0.4 }]
    };
});

const rendicionesDesgloseData = computed(() => {
    if (!rendicionesDashboardData.value?.charts?.desglose_gastos) return null;
    const sourceData = rendicionesDashboardData.value.charts.desglose_gastos;
    return {
        labels: sourceData.map(d => d.tipo),
        datasets: [{ label: 'Gasto por Tipo', data: sourceData.map(d => d.total), backgroundColor: chartColors, borderRadius: 4 }]
    };
});

// --- LÓGICA DE EXPORTACIÓN ---
const handleExport = (exportFn, successMsg) => {
  showNotification('Exportando', 'Preparando tu reporte...', 'info');
  try { exportFn(); setTimeout(() => { showNotification('Éxito', successMsg, 'success'); }, 500); } 
  catch (e) { showNotification('Error', 'No se pudo generar el reporte.', 'error'); console.error("Error al exportar:", e); }
};
const handleExportGastosEvolution = () => handleExport(() => {
  const dataToExport = gastosDashboardData.value?.charts?.evolucion_origen.map(d => ({ Mes: formatDate(d.mes, { month: 'long', year: 'numeric'}), Gastos_Viaje_Rendicion: d.total_viaje, Gastos_Caja_Chica: d.total_caja })) || [];
  exportToExcel(dataToExport, 'evolucion_por_origen');
}, 'Reporte de evolución de gastos generado.');
const handleExportRendicionesEficiencia = () => handleExport(() => {
    exportToExcel(rendicionesDashboardData.value?.tabla_eficiencia || [], 'eficiencia_por_responsable');
}, 'Reporte de eficiencia generado.');
const handleExportExploration = () => handleExport(() => {
  exportToExcel(explorationGastosFiltrados.value, 'exploracion_avanzada');
}, 'Reporte de exploración generado.');

// --- WATCHERS Y CICLO DE VIDA ---
onMounted(() => {
  fetchTipoGastoOptions();
  fetchGastosDashboardData();
});
watch([gastosSelectedPeriod, gastosGlobalTipoGastoFilter], fetchGastosDashboardData);
watch(activeTab, async (newTab) => {
  if (newTab === 'rendiciones' && !rendicionesDashboardData.value) {
    fetchPerfilesOptions();
    fetchRendicionesDashboardData();
  }
  if (newTab === 'exploracion') {
    await fetchExplorationOptions();
    if (explorationGastosFiltrados.value.length === 0) {
      await applyExplorationFilters();
    }
  }
});
watch(rendicionesFilters, fetchRendicionesDashboardData, { deep: true });
watch(explorationFilters, () => {
    if (activeTab.value !== 'exploracion') return;
    const debounceTimeout = ref(null);
    clearTimeout(debounceTimeout.value);
    debounceTimeout.value = setTimeout(() => {
        applyExplorationFilters();
    }, 500);
}, { deep: true });
</script>
<template>
  <div>
    <div class="bg-gray-50/50 min-h-screen">
      <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        <div class="mb-6">
          <h1 class="text-3xl sm:text-4xl font-bold text-gray-800 tracking-tight">Centro de Análisis</h1>
          <p class="mt-1 text-gray-600">Paneles estratégicos para gastos y rendiciones.</p>
        </div>

        <div class="border-b border-gray-200 mb-6">
          <nav class="-mb-px flex space-x-6" aria-label="Tabs">
            <button @click="activeTab = 'gastos'" :class="[activeTab === 'gastos' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300', 'group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm']">
              <ChartPieIcon class="-ml-0.5 mr-2 h-5 w-5" />
              <span>Análisis de Gastos</span>
            </button>
            <button @click="activeTab = 'rendiciones'" :class="[activeTab === 'rendiciones' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300', 'group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm']">
              <BriefcaseIcon class="-ml-0.5 mr-2 h-5 w-5" />
              <span>Análisis de Rendiciones</span>
            </button>
            <button @click="activeTab = 'exploracion'" :class="[activeTab === 'exploracion' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300', 'group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm']">
              <MagnifyingGlassIcon class="-ml-0.5 mr-2 h-5 w-5" />
              <span>Exploración Avanzada</span>
            </button>
          </nav>
        </div>

        <!-- PESTAÑA 1: ANÁLISIS DE GASTOS -->
        <div v-if="activeTab === 'gastos'">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label class="form-label">Filtrar por Tipo de Gasto</label>
              <v-select multiple v-model="gastosGlobalTipoGastoFilter" :options="gastosTipoGastoOptions" :loading="loading.tipoGastoOptions" placeholder="Todos los Tipos" class="v-select-filter bg-white"></v-select>
            </div>
            <div class="flex items-end justify-end">
              <select v-model="gastosSelectedPeriod" class="form-input !mt-0 w-full sm:w-56">
                  <option v-for="option in gastosPeriodOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </div>
          </div>
          <div v-if="loading.dashboardGastos" class="text-center py-20">
              <svg class="animate-spin h-12 w-12 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          </div>
          <div v-else-if="error.dashboardGastos" class="error-banner">{{ error.dashboardGastos }}</div>
          <div v-else-if="gastosDashboardData" class="space-y-8">
            <section><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard :title="`Gasto Total (${gastosPeriodOptions.find(p=>p.value === gastosSelectedPeriod)?.label || ''})`" :value="gastosKPIs.gasto_total_periodo" format="currency" />
                <StatCard title="Saldo en Cajas" :value="gastosKPIs.saldo_cajas_chicas" format="currency" />
                <StatCard title="Delegados Pendientes" :value="gastosKPIs.delegados_pendientes" format="currency" />
                <StatCard title="Valor Rendiciones Pendientes" :value="gastosKPIs.rendiciones_pendientes_valor" format="currency" />
            </div></section>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <section class="lg:col-span-2 section-container"><h2 class="section-title">Evolución por Origen</h2><div class="h-96"><LineChart v-if="gastosProcessedEvolutionData" :data="gastosProcessedEvolutionData" :options="{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }"/></div></section>
              <section class="lg:col-span-1 section-container"><h2 class="section-title">Desglose por Tipo</h2><div class="relative h-48"><Doughnut ref="gastosDoughnutChartRef" v-if="gastosDesgloseTipoData?.datasets[0].data.length" :data="gastosDesgloseTipoData" :options="{responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false }, tooltip: { enabled: false } }, onClick: handleDoughnutClick }"/><div class="absolute inset-0 flex flex-col justify-center items-center pointer-events-none"><span class="text-gray-500 text-sm">Gasto Total</span><span class="text-2xl font-bold text-gray-800">{{ formatCurrency(gastosTotalDesglose) }}</span></div></div><div class="mt-4 space-y-2 max-h-48 overflow-y-auto pr-2"><div v-for="(item, index) in gastosDashboardData.charts.desglose_tipo" :key="item.tipo_gasto_id" @mouseover="gastosHoveredSliceIndex = index" @mouseleave="gastosHoveredSliceIndex = null" @click="drillDown('tipoGasto', item.tipo_gasto_id)" class="flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-gray-100"><div class="flex items-center gap-3"><span class="h-3 w-3 rounded-full" :style="{ backgroundColor: chartColors[index % chartColors.length] }"></span><span class="text-sm font-medium text-gray-700">{{ item.tipo }}</span></div><span class="text-sm font-semibold text-gray-800">{{ formatCurrency(item.total) }}</span></div><div v-if="!gastosDashboardData.charts.desglose_tipo.length" class="text-center text-gray-500 py-4">No hay desglose para mostrar.</div></div></section>
            </div>
          </div>
        </div>

        <!-- PESTAÑA 2: ANÁLISIS DE RENDICIONES -->
        <div v-if="activeTab === 'rendiciones'">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div class="md:col-span-1"><label class="form-label">Rango de Fechas (Cierre)</label><div class="flex gap-2"><input type="date" v-model="rendicionesFilters.fechaDesde" class="form-input"><input type="date" v-model="rendicionesFilters.fechaHasta" class="form-input"></div></div>
              <div class="md:col-span-1"><label class="form-label">Filtrar por Responsable</label><v-select v-model="rendicionesFilters.responsableId" :options="perfilesOptions" :loading="loading.perfilesOptions" placeholder="Todos" class="v-select-filter bg-white"></v-select></div>
          </div>
          <div v-if="loading.dashboardRendiciones" class="text-center py-20"><svg class="animate-spin h-12 w-12 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>
          <div v-else-if="error.dashboardRendiciones" class="error-banner">{{ error.dashboardRendiciones }}</div>
          <div v-else-if="rendicionesDashboardData" class="space-y-8">
            <section><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Costo Promedio / Rendición" :value="rendicionesKPIs.costo_promedio_rendicion" format="currency" />
                <StatCard title="Rendiciones Cerradas" :value="rendicionesKPIs.numero_rendiciones_cerradas" />
                <StatCard title="Duración Promedio (Días)" :value="rendicionesKPIs.duracion_promedio_dias.toFixed(1)" />
                <StatCard title="Monto Total en Rendiciones" :value="rendicionesKPIs.monto_total_rendiciones" format="currency" />
            </div></section>
            <section class="section-container">
                <div class="flex justify-between items-center mb-4"><h2 class="section-title mb-0">Eficiencia por Responsable</h2><button @click="handleExportRendicionesEficiencia" class="btn-icon" title="Exportar a XLS"><ArrowDownTrayIcon class="h-5 w-5" /></button></div>
                <div class="overflow-x-auto"><table class="min-w-full text-sm">
                    <thead class="bg-gray-50"><tr><th class="table-header">Responsable</th><th class="table-header text-center">N° Rendiciones</th><th class="table-header text-right">Costo Promedio</th><th class="table-header text-right">Gasto Total</th></tr></thead>
                    <tbody class="divide-y divide-gray-200"><tr v-for="item in rendicionesDashboardData.tabla_eficiencia" :key="item.responsable"><td class="table-cell font-medium">{{ item.responsable }}</td><td class="table-cell text-center">{{ item.numero_rendiciones }}</td><td class="table-cell text-right">{{ formatCurrency(item.costo_promedio) }}</td><td class="table-cell text-right font-bold">{{ formatCurrency(item.gasto_total) }}</td></tr></tbody>
                </table></div>
            </section>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <section class="section-container"><h2 class="section-title">Evolución del Costo de Rendiciones</h2><div class="h-80"><LineChart v-if="rendicionesEvolucionData" :data="rendicionesEvolucionData" :options="{responsive:true, maintainAspectRatio: false, plugins: {legend: {display:false}}}" /></div></section>
              <section class="section-container"><h2 class="section-title">Desglose de Gastos en Rendiciones</h2><div class="h-80"><Bar v-if="rendicionesDesgloseData" :data="rendicionesDesgloseData" :options="{responsive:true, maintainAspectRatio: false, indexAxis: 'y', plugins: {legend: {display:false}}}" /></div></section>
            </div>
          </div>
        </div>

        <!-- PESTAÑA 3: EXPLORACIÓN AVANZADA -->
        <div v-if="activeTab === 'exploracion'" id="exploration-content">
          <div v-if="loading.exploration && explorationGastosFiltrados.length === 0" class="text-center py-20"><svg class="animate-spin h-12 w-12 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>
          <div v-else-if="error.exploration" class="error-banner">{{ error.exploration }}</div>
          <div v-else class="space-y-8">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div><label class="form-label">Tipo de Gasto</label><v-select v-model="explorationFilters.tipoGastoId" :options="explorationOptions.tiposGasto" placeholder="Todos" class="v-select-filter"></v-select></div>
              <div><label class="form-label">Cliente</label><v-select v-model="explorationFilters.clienteId" :options="explorationOptions.clientes" placeholder="Todos" class="v-select-filter"></v-select></div>
              <div><label class="form-label">Transporte</label><v-select v-model="explorationFilters.transporteId" :options="explorationOptions.transportes" placeholder="Todos" class="v-select-filter"></v-select></div>
              <div><label class="form-label">Provincia</label><v-select v-model="explorationFilters.provincia" :options="explorationOptions.provincias" placeholder="Todas" class="v-select-filter"></v-select></div>
              <div class="md:col-span-2 lg:col-span-2"><label class="form-label">Rango de Fechas</label><div class="flex gap-2"><input type="date" v-model="explorationFilters.fechaDesde" class="form-input"><input type="date" v-model="explorationFilters.fechaHasta" class="form-input"></div></div>
              <div class="md:col-span-2 lg:col-span-2"><label class="form-label">Buscar por Paciente / Descripción</label><input type="text" v-model="explorationFilters.paciente" placeholder="Nombre de paciente o descripción..." class="form-input"></div>
            </div>
            <div class="flex justify-end"><button @click="handleExportExploration" :disabled="explorationGastosFiltrados.length === 0" class="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"><ArrowDownTrayIcon class="h-5 w-5" />Exportar a XLS</button></div>
            <div><h3 class="section-title">Detalle de Gastos Filtrados</h3><div v-if="explorationGastosFiltrados.length > 0" class="overflow-x-auto section-container !p-0"><table class="min-w-full text-sm"><thead class="bg-gray-50"><tr><th class="table-header">Fecha</th><th class="table-header">Responsable</th><th class="table-header">Tipo</th><th class="table-header">Descripción</th><th class="table-header text-right">Monto</th></tr></thead><tbody class="divide-y divide-gray-200"><tr v-for="gasto in explorationGastosFiltrados" :key="gasto.gasto_id" class="hover:bg-gray-50"><td class="table-cell">{{ formatDate(gasto.fecha_gasto) }}</td><td class="table-cell font-medium text-gray-800">{{ gasto.responsable_gasto_nombre }}</td><td class="table-cell">{{ gasto.nombre_tipo_gasto }}</td><td class="table-cell max-w-xs truncate" :title="gasto.gasto_descripcion">{{ gasto.gasto_descripcion }}</td><td class="table-cell text-right font-bold">{{ formatCurrency(gasto.gasto_monto_total) }}</td></tr></tbody></table></div><div v-else class="no-data-placeholder py-10">No se encontraron gastos con los filtros aplicados.</div></div>
          </div>
        </div>

      </div>
    </div>
    <ToastNotification :notification="notification" />
  </div>
</template>

<style>
.form-label { @apply block text-sm font-medium text-gray-700 mb-1; }
.form-input { @apply block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm; }
.section-title { @apply text-xl font-semibold text-gray-700 mb-4; }
.section-container { @apply bg-white p-6 rounded-xl shadow-lg border; }
.kpi-card { @apply bg-white p-6 rounded-xl shadow-lg border text-center transition-shadow hover:shadow-md; }
.no-data-placeholder { @apply flex justify-center items-center h-full text-center text-gray-500; }
.error-banner { @apply p-4 bg-red-50 text-red-700 border border-red-200 rounded-md; }
.table-header { @apply px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider; }
.table-cell { @apply px-4 py-4 whitespace-nowrap text-sm text-gray-600; }
.btn-primary { @apply bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors; }
.btn-icon { @apply p-2 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800 transition-colors; }
.v-select-filter { --vs-controls-color: #6b7280; --vs-border-color: #d1d5db; --vs-dropdown-bg: #ffffff; --vs-dropdown-option-bg: #ffffff; --vs-dropdown-option-color: #374151; --vs-dropdown-option-padding: 0.5rem 1rem; --vs-dropdown-option--active-bg: #3b82f6; --vs-dropdown-option--active-color: #ffffff; --vs-selected-bg: #3b82f6; --vs-selected-color: #ffffff; --vs-search-input-color: #4b5563; --vs-line-height: 1.5; --vs-font-size: 0.875rem; }
</style>