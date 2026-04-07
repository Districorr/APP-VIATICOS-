<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { supabase } from '../../../supabaseClient';
import { formatCurrency, formatDate } from '../../../utils/formatters.js';
import { Bar, Doughnut, getElementAtEvent } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, PointElement, LineElement, Filler, TimeScale, ArcElement } from 'chart.js';

import StatCard from '../StatCard.vue';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';
import { UsersIcon, ArrowTrendingUpIcon, PresentationChartLineIcon, StarIcon } from '@heroicons/vue/24/outline';

// Registro de Chart.js
ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, PointElement, LineElement, Filler, TimeScale, ArcElement);

// --- PROPS Y EMITS ---
const props = defineProps({
  tipoGastoOptions: { type: Array, required: true },
  loadingOptions: { type: Boolean, required: true },
});

const emit = defineEmits(['open-desglose-modal', 'drill-down', 'show-notification']);

// --- ESTADO LOCAL DE LA PESTAÑA ---
const dashboardData = ref(null);
const insightsData = ref(null);
const loading = ref(true);
const loadingInsights = ref(true);
const error = ref('');
const selectedPeriod = ref('30d');
const globalTipoGastoFilter = ref([]);
const doughnutChartRef = ref(null);
const hoveredSliceIndex = ref(null);

// AÑADIDO: Estado para los adelantos
const adelantosEnCirculacion = ref(null);
const loadingAdelantos = ref(true);

const periodOptions = [
  { label: 'Últimos 7 días', value: '7d' },
  { label: 'Últimos 30 días', value: '30d' },
  { label: 'Este Mes', value: 'this_month' },
  { label: 'Mes Pasado', value: 'last_month' }
];

// --- LÓGICA DE CARGA DE DATOS ---
const dateRange = computed(() => {
  let end = new Date();
  let start = new Date();
  switch (selectedPeriod.value) {
    case '7d': start.setDate(end.getDate() - 7); break;
    case 'this_month': start = new Date(end.getFullYear(), end.getMonth(), 1); break;
    case 'last_month': 
      end = new Date(end.getFullYear(), end.getMonth(), 0); 
      start = new Date(end.getFullYear(), end.getMonth(), 1); 
      break;
    default: start.setDate(end.getDate() - 30);
  }
  return { p_start_date: start.toISOString().split('T')[0], p_end_date: end.toISOString().split('T')[0] };
});

// AÑADIDO: Función para cargar los adelantos
async function fetchAdelantosData() {
  loadingAdelantos.value = true;
  try {
    const { data, error: rpcError } = await supabase.rpc('get_total_adelantos_activos');
    if (rpcError) throw rpcError;
    adelantosEnCirculacion.value = data;
  } catch (e) {
    console.error("Error al cargar los adelantos en circulación:", e);
  } finally {
    loadingAdelantos.value = false;
  }
}

async function fetchData() {
  loading.value = true;
  loadingInsights.value = true;
  error.value = '';
  try {
    const params = {
      ...dateRange.value,
      p_tipo_gasto_ids: globalTipoGastoFilter.value.length > 0 ? globalTipoGastoFilter.value.map(f => f.code) : null
    };
    
    const [overviewResult, insightsResult] = await Promise.all([
      supabase.rpc('get_admin_strategic_overview', params),
      supabase.rpc('get_gastos_dashboard_insights', { p_start_date: params.p_start_date, p_end_date: params.p_end_date })
    ]);

    if (overviewResult.error) throw overviewResult.error;
    dashboardData.value = overviewResult.data;
    
    if (insightsResult.error) throw insightsResult.error;
    insightsData.value = insightsResult.data;

  } catch (e) {
    console.error("Error al cargar el dashboard de gastos:", e);
    error.value = `Error al cargar el dashboard de gastos: ${e.message}`;
  } finally {
    loading.value = false;
    loadingInsights.value = false;
  }
}

// --- LÓGICA DE INTERACTIVIDAD ---
function handleDoughnutClick(event) {
  const chart = doughnutChartRef.value?.chart;
  if (!chart) return;
  const points = getElementAtEvent(chart, event);
  if (points.length) {
    const pointIndex = points[0].index;
    const tipoGastoId = dashboardData.value.charts.desglose_tipo[pointIndex]?.tipo_gasto_id;
    if (tipoGastoId) {
      emit('drill-down', { filterType: 'tipoGasto', value: tipoGastoId });
    }
  }
}

// --- COMPUTED PROPERTIES ---
const chartColors = ['#3b82f6', '#10b981', '#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#64748b', '#f59e0b', '#14b8a6', '#d946ef'];
const kpis = computed(() => dashboardData.value?.kpis);
const totalDesglose = computed(() => dashboardData.value?.charts?.desglose_tipo.reduce((sum, item) => sum + parseFloat(item.total), 0) || 0);

const desgloseTipoData = computed(() => {
  if (!dashboardData.value?.charts?.desglose_tipo) return null;
  const data = dashboardData.value.charts.desglose_tipo;
  const backgroundColors = data.map((_, index) => hoveredSliceIndex.value === null ? chartColors[index % chartColors.length] : (index === hoveredSliceIndex.value ? chartColors[index % chartColors.length] : `${chartColors[index % chartColors.length]}40`));
  return { labels: data.map(item => item.tipo), datasets: [{ data: data.map(item => item.total), backgroundColor: backgroundColors, borderWidth: 0 }] };
});

const tacticalKpis = computed(() => dashboardData.value?.charts?.tactical_evolution?.kpis || {});

const stackedBarChartData = computed(() => {
    const timelineData = dashboardData.value?.charts?.tactical_evolution?.timeline_data;
    if (!timelineData || timelineData.length === 0) return null;
    const labels = timelineData.map(d => formatDate(d.periodo, { month: 'short', day: 'numeric' }));
    const allTipos = [...new Set(timelineData.flatMap(d => d.desglose.map(item => item.tipo)))];
    const datasets = allTipos.map((tipo, index) => ({
        label: tipo,
        data: timelineData.map(periodo => periodo.desglose.find(d => d.tipo === tipo)?.total || 0),
        backgroundColor: chartColors[index % chartColors.length],
    }));
    return { labels, datasets };
});

const stackedBarChartOptions = computed(() => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}` } } },
    scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: (val) => formatCurrency(val) } } }
}));

// --- WATCHERS Y CICLO DE VIDA ---
onMounted(() => {
  fetchData();
  fetchAdelantosData(); // AÑADIDO: Llamada a la función
});
watch([selectedPeriod, globalTipoGastoFilter], fetchData);
</script>
<template>
  <div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      <div>
        <label class="form-label">Filtrar por Tipo de Gasto</label>
        <v-select multiple v-model="globalTipoGastoFilter" :options="tipoGastoOptions" :loading="loadingOptions" placeholder="Todos los Tipos" class="v-select-filter bg-white"></v-select>
      </div>
      <div class="flex items-end justify-end">
        <select v-model="selectedPeriod" class="form-input !mt-0 w-full sm:w-56">
            <option v-for="option in periodOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </div>
    </div>
    <div v-if="loading && !dashboardData" class="text-center py-20">
        <svg class="animate-spin h-12 w-12 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
    </div>
    <div v-else-if="error" class="error-banner">{{ error }}</div>
    <div v-else class="space-y-8">
      <section><div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
          <StatCard :title="`Gasto Total (${periodOptions.find(p=>p.value === selectedPeriod)?.label || ''})`" :value="kpis?.gasto_total_periodo" formatAs="currency" :loading="loading" />
          <StatCard title="Saldo en Cajas" :value="kpis?.saldo_cajas_chicas" formatAs="currency" :loading="loading" />
          <StatCard 
            title="Adelantos en Circulación" 
            :value="adelantosEnCirculacion" 
            :loading="loading"
            :icon="UsersIcon"
            formatAs="currency" 
            @click="emit('open-desglose-modal')" 
            class="cursor-pointer transition-all duration-300 hover:shadow-xl hover:border-blue-500"
          /> 
          <StatCard title="Delegados Pendientes" :value="kpis?.delegados_pendientes" formatAs="currency" :loading="loading" />
          <StatCard title="Valor Rendiciones Pendientes" :value="kpis?.rendiciones_pendientes_valor" formatAs="currency" :loading="loading" />
      </div></section>
      
      <!-- INICIO: NUEVA SECCIÓN DE INSIGHTS DE GASTOS -->
      <section v-if="!loadingInsights && insightsData" class="section-container bg-gray-100 border-gray-200">
        <h2 class="section-title text-gray-800">Insights del Período</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div class="insight-card-gastos">
            <p v-if="insightsData.prediction_day" class="insight-text">Se prevé que los <span class="insight-highlight">{{ insightsData.prediction_day }}</span> se realicen más cargos de gastos.</p>
            <p v-else class="insight-text">No hay datos suficientes para predecir el día de mayor gasto.</p>
          </div>
          <div class="insight-card-gastos">
            <div v-if="insightsData.highest_gasto">
              <p class="insight-text">El gasto más alto fue de <span class="insight-highlight">{{ formatCurrency(insightsData.highest_gasto.monto_total) }}</span>.</p>
              <p class="text-xs text-gray-500 mt-1">Tipo: {{ insightsData.highest_gasto.nombre_tipo_gasto }}</p>
              <p class="text-xs text-gray-500">Responsable: {{ insightsData.highest_gasto.responsable }}</p>
            </div>
            <p v-else class="insight-text">No se registraron gastos individuales en el período.</p>
          </div>
          <div class="insight-card-gastos">
            <div v-if="insightsData.spending_trend">
              <p class="insight-text">Se registra una tendencia a <span :class="insightsData.spending_trend > 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold'">{{ insightsData.spending_trend > 0 ? 'la alza' : 'la baja' }}</span> en gastos, con un <span class="insight-highlight">{{ Math.abs(insightsData.spending_trend).toFixed(0) }}%</span> de {{ insightsData.spending_trend > 0 ? 'aumento' : 'disminución' }}.</p>
            </div>
            <p v-else class="insight-text">No hay datos del período anterior para comparar tendencias.</p>
          </div>
          <div class="insight-card-gastos">
            <div v-if="insightsData.top_client">
              <p class="insight-text">El cliente con más movimiento fue <span class="insight-highlight">{{ insightsData.top_client.nombre_cliente }}</span>.</p>
              <p class="text-xs text-gray-500 mt-1">Con un gasto total de {{ formatCurrency(insightsData.top_client.total) }}</p>
            </div>
            <p v-else class="insight-text">No se registraron gastos asociados a clientes.</p>
          </div>
          <div class="insight-card-gastos">
            <div v-if="insightsData.top_destinations && insightsData.top_destinations.length > 0">
              <p class="insight-text">Los destinos más habituales fueron <span class="insight-highlight">{{ insightsData.top_destinations.join(', ') }}</span>.</p>
            </div>
            <p v-else class="insight-text">No se registraron destinos en los gastos.</p>
          </div>
        </div>
      </section>
      <!-- FIN: NUEVA SECCIÓN DE INSIGHTS DE GASTOS -->

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section class="lg:col-span-2 section-container">
          <h2 class="section-title">Análisis Táctico de Gastos</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div class="tactical-kpi-card">
              <div class="flex items-center gap-3"><div class="p-2 bg-amber-100 rounded-lg"><StarIcon class="h-5 w-5 text-amber-600"/></div><h3 class="font-semibold text-gray-700">Gasto Principal</h3></div>
              <div v-if="tacticalKpis.gasto_principal" class="mt-2">
                <p class="text-lg font-bold text-gray-800">{{ tacticalKpis.gasto_principal.nombre_tipo_gasto }}</p>
                <p class="text-sm text-gray-600">{{ formatCurrency(tacticalKpis.gasto_principal.total_actual) }}</p>
                <div class="w-full bg-gray-200 rounded-full h-2 mt-2"><div class="bg-amber-500 h-2 rounded-full" :style="{ width: `${tacticalKpis.gasto_principal.porcentaje || 0}%` }"></div></div>
                <p class="text-xs text-right text-gray-500 mt-1">{{ (tacticalKpis.gasto_principal.porcentaje || 0).toFixed(0) }}% del total</p>
              </div>
              <div v-else class="text-sm text-gray-500 mt-2">No hay datos.</div>
            </div>
            <div class="tactical-kpi-card">
              <div class="flex items-center gap-3"><div class="p-2 bg-red-100 rounded-lg"><ArrowTrendingUpIcon class="h-5 w-5 text-red-600"/></div><h3 class="font-semibold text-gray-700">Mayor Aumento</h3></div>
              <div v-if="tacticalKpis.top_mover" class="mt-2">
                <p class="text-lg font-bold text-gray-800">{{ tacticalKpis.top_mover.nombre_tipo_gasto }}</p>
                <p class="text-2xl font-bold text-red-600">+{{ (tacticalKpis.top_mover.variacion_pct || 0).toFixed(0) }}%</p>
                <p class="text-xs text-gray-500">vs. período anterior</p>
              </div>
              <div v-else class="text-sm text-gray-500 mt-2">Sin datos de comparación.</div>
            </div>
            <div class="tactical-kpi-card">
              <div class="flex items-center gap-3"><div class="p-2 bg-blue-100 rounded-lg"><PresentationChartLineIcon class="h-5 w-5 text-blue-600"/></div><h3 class="font-semibold text-gray-700">Gasto Promedio Diario</h3></div>
              <div class="mt-2">
                <p class="text-2xl font-bold text-gray-800">{{ formatCurrency(tacticalKpis.gasto_promedio_diario || 0) }}</p>
                <p class="text-xs text-gray-500">en el período seleccionado</p>
              </div>
            </div>
          </div>
          <div class="h-80">
            <Bar v-if="stackedBarChartData" :data="stackedBarChartData" :options="stackedBarChartOptions"/>
            <div v-else class="no-data-placeholder h-full">No hay datos de evolución para mostrar.</div>
          </div>
        </section>
        <section class="lg:col-span-1 section-container"><h2 class="section-title">Desglose por Tipo</h2><div class="relative h-48"><Doughnut ref="doughnutChartRef" v-if="desgloseTipoData?.datasets[0].data.length" :data="desgloseTipoData" :options="{responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false }, tooltip: { enabled: false } }, onClick: handleDoughnutClick }"/><div class="absolute inset-0 flex flex-col justify-center items-center pointer-events-none"><span class="text-gray-500 text-sm">Gasto Total</span><span class="text-2xl font-bold text-gray-800">{{ formatCurrency(totalDesglose) }}</span></div></div><div class="mt-4 space-y-2 max-h-48 overflow-y-auto pr-2"><div v-for="(item, index) in dashboardData?.charts.desglose_tipo || []" :key="item.tipo_gasto_id" @mouseover="hoveredSliceIndex = index" @mouseleave="hoveredSliceIndex = null" @click="handleDoughnutClick" class="flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-gray-100"><div class="flex items-center gap-3"><span class="h-3 w-3 rounded-full" :style="{ backgroundColor: chartColors[index % chartColors.length] }"></span><span class="text-sm font-medium text-gray-700">{{ item.tipo }}</span></div><span class="text-sm font-semibold text-gray-800">{{ formatCurrency(item.total) }}</span></div><div v-if="!dashboardData?.charts.desglose_tipo.length" class="text-center text-gray-500 py-4">No hay desglose para mostrar.</div></div></section>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* AÑADIDO: Estilos para las nuevas tarjetas de insights de gastos */
.insight-card-gastos {
  @apply bg-white/60 p-4 rounded-lg shadow-sm min-h-[100px];
}
.insight-text {
  @apply text-sm text-gray-700;
}
.insight-highlight {
  @apply font-bold text-blue-700;
}
</style>