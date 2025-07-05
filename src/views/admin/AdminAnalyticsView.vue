<!-- src/views/admin/AdminAnalyticsView.vue -->
<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { supabase } from '../../supabaseClient.js';
// INICIO DE MI CORRECCIÓN: Añadida la importación que faltaba
import { formatCurrency, formatDate } from '../../utils/formatters.js';
// FIN DE MI CORRECCIÓN
import { Bar, Line as LineChart } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, PointElement, LineElement, Filler, TimeScale } from 'chart.js';
import 'chartjs-adapter-date-fns';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, PointElement, LineElement, Filler, TimeScale);

// --- ESTADO GENERAL ---
const loading = ref(true);
const error = ref('');
const debounceTimeout = ref(null);

// --- ESTADO DE FILTROS ---
const filtros = ref({
  clienteId: null,
  transporteId: null,
  tipoGastoId: null,
  provincia: null,
  paciente: '',
  fechaDesde: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
  fechaHasta: new Date().toISOString().split('T')[0],
});

// --- ESTADO PARA LAS OPCIONES DE LOS SELECTS ---
const opciones = ref({
  clientes: [],
  transportes: [],
  tiposGasto: [],
  provincias: [],
});

// --- ESTADO DE DATOS FILTRADOS ---
const gastosFiltrados = ref([]);

// --- LÓGICA DE CARGA DE DATOS ---
async function fetchFilterOptions() {
  try {
    const [clientesRes, transportesRes, tiposGastoRes, provinciasRes] = await Promise.all([
      supabase.from('clientes').select('id, nombre_cliente').order('nombre_cliente'),
      supabase.from('transportes').select('id, nombre').order('nombre'),
      supabase.from('tipos_gasto_config').select('id, nombre_tipo_gasto').order('nombre_tipo_gasto'),
      supabase.rpc('get_provincias_unicas_gastos')
    ]);
    
    if (clientesRes.error) throw clientesRes.error;
    opciones.value.clientes = clientesRes.data.map(c => ({ label: c.nombre_cliente, code: c.id }));

    if (transportesRes.error) throw transportesRes.error;
    opciones.value.transportes = transportesRes.data.map(t => ({ label: t.nombre, code: t.id }));

    if (tiposGastoRes.error) throw tiposGastoRes.error;
    opciones.value.tiposGasto = tiposGastoRes.data.map(t => ({ label: t.nombre_tipo_gasto, code: t.id }));
    
    if (provinciasRes.error) throw provinciasRes.error;
    opciones.value.provincias = provinciasRes.data.map(p => p.provincia).filter(Boolean);

  } catch (e) {
    console.error("Error cargando opciones de filtro:", e);
    error.value = "No se pudieron cargar las opciones de filtro.";
  }
}

async function applyFiltersAndFetchData() {
  loading.value = true;
  error.value = '';
  try {
    const params = {
      p_cliente_id: filtros.value.clienteId?.code || null,
      p_transporte_id: filtros.value.transporteId?.code || null,
      p_tipo_gasto_id: filtros.value.tipoGastoId?.code || null,
      p_provincia: filtros.value.provincia || null,
      p_paciente: filtros.value.paciente || null,
      p_fecha_desde: filtros.value.fechaDesde || null,
      p_fecha_hasta: filtros.value.fechaHasta || null,
    };
    
    const { data, error: rpcError } = await supabase.rpc('filtrar_gastos_admin', params);

    if (rpcError) throw rpcError;
    
    gastosFiltrados.value = data || [];

  } catch (e) {
    console.error("Error al aplicar filtros y buscar datos:", e);
    error.value = `Error al buscar datos: ${e.message}`;
    gastosFiltrados.value = [];
  } finally {
    loading.value = false;
  }
}

// --- PROPIEDADES COMPUTADAS PARA GRÁFICOS Y KPIs ---
const kpis = computed(() => {
  const total = gastosFiltrados.value.reduce((sum, g) => sum + (g.gasto_monto_total || 0), 0);
  const count = gastosFiltrados.value.length;
  return {
    totalGastado: total,
    cantidadGastos: count,
    costoPromedio: count > 0 ? total / count : 0,
  };
});

const topTiposGastoData = computed(() => {
  const resumen = gastosFiltrados.value.reduce((acc, gasto) => {
    const tipo = gasto.nombre_tipo_gasto || 'Sin Categoría';
    acc[tipo] = (acc[tipo] || 0) + gasto.gasto_monto_total;
    return acc;
  }, {});

  const sorted = Object.entries(resumen).sort((a, b) => b[1] - a[1]).slice(0, 7);
  if (sorted.length === 0) return null;

  return {
    labels: sorted.map(item => item[0]),
    datasets: [{
      label: 'Total Gastado',
      data: sorted.map(item => item[1]),
      backgroundColor: '#3498DB',
      borderRadius: 4,
    }]
  };
});

const evolucionGastosData = computed(() => {
    const resumen = gastosFiltrados.value.reduce((acc, gasto) => {
        const fecha = gasto.fecha_gasto.split('T')[0];
        acc[fecha] = (acc[fecha] || 0) + gasto.gasto_monto_total;
        return acc;
    }, {});

    const sorted = Object.entries(resumen).sort((a, b) => new Date(a[0]) - new Date(b[0]));
    if (sorted.length === 0) return null;

    return {
        datasets: [{
            label: 'Total Gastado por Día',
            data: sorted.map(([fecha, total]) => ({ x: fecha, y: total })),
            borderColor: '#2ECC71',
            backgroundColor: 'rgba(46, 204, 113, 0.2)',
            fill: true,
            tension: 0.3,
        }]
    };
});

// --- OPCIONES DE GRÁFICOS ---
const barChartOptions = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => formatCurrency(ctx.raw) } } },
};
const lineChartOptions = {
  responsive: true, maintainAspectRatio: false,
  scales: { x: { type: 'time', time: { unit: 'day' } }, y: { ticks: { callback: value => formatCurrency(value, 'ARS', 0) } } },
  plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label || ''}: ${formatCurrency(ctx.parsed.y)}` } } }
};

// --- CICLO DE VIDA Y WATCHERS ---
onMounted(() => {
  fetchFilterOptions();
  applyFiltersAndFetchData();
});

watch(filtros, () => {
  clearTimeout(debounceTimeout.value);
  debounceTimeout.value = setTimeout(() => {
    applyFiltersAndFetchData();
  }, 500);
}, { deep: true });
</script>

<template>
  <div class="bg-gray-50/50 min-h-screen">
    <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      <div class="mb-6">
        <h1 class="text-3xl sm:text-4xl font-bold text-gray-800 tracking-tight">
          Análisis de Gastos
        </h1>
        <p class="mt-1 text-gray-600">Filtra y explora todos los gastos de la compañía.</p>
      </div>

      <!-- Panel de Filtros Avanzados -->
      <section class="mb-8 p-4 bg-white rounded-xl shadow-lg border">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div><label class="form-label">Tipo de Gasto</label><v-select v-model="filtros.tipoGastoId" :options="opciones.tiposGasto" placeholder="Todos" class="v-select-filter"></v-select></div>
          <div><label class="form-label">Cliente</label><v-select v-model="filtros.clienteId" :options="opciones.clientes" placeholder="Todos" class="v-select-filter"></v-select></div>
          <div><label class="form-label">Transporte</label><v-select v-model="filtros.transporteId" :options="opciones.transportes" placeholder="Todos" class="v-select-filter"></v-select></div>
          <div><label class="form-label">Provincia</label><v-select v-model="filtros.provincia" :options="opciones.provincias" placeholder="Todas" class="v-select-filter"></v-select></div>
          
          <div class="md:col-span-2 lg:col-span-2"><label class="form-label">Rango de Fechas</label><div class="flex gap-2"><input type="date" v-model="filtros.fechaDesde" class="form-input"><input type="date" v-model="filtros.fechaHasta" class="form-input"></div></div>
          <div class="md:col-span-2 lg:col-span-2"><label class="form-label">Buscar por Paciente / Descripción</label><input type="text" v-model="filtros.paciente" placeholder="Nombre de paciente o descripción..." class="form-input"></div>
        </div>
      </section>

      <div v-if="loading" class="text-center py-20">
        <svg class="animate-spin h-12 w-12 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <p class="mt-4 text-lg text-gray-600">Aplicando filtros y cargando datos...</p>
      </div>
      <div v-else-if="error" class="error-banner">{{ error }}</div>
      
      <div v-else id="dashboard-analytics" class="space-y-8">
        <!-- KPIs Dinámicos -->
        <section>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="kpi-card"><p class="kpi-label">Gasto Total (Filtro Actual)</p><p class="kpi-value">{{ formatCurrency(kpis.totalGastado) }}</p></div>
            <div class="kpi-card"><p class="kpi-label">N° de Gastos Encontrados</p><p class="kpi-value">{{ kpis.cantidadGastos }}</p></div>
            <div class="kpi-card"><p class="kpi-label">Costo Promedio por Gasto</p><p class="kpi-value">{{ formatCurrency(kpis.costoPromedio) }}</p></div>
          </div>
        </section>

        <!-- Gráficos Dinámicos -->
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <section class="section-container lg:col-span-3">
            <h2 class="section-title">Evolución de Gastos (Filtro Actual)</h2>
            <div class="chart-container-wrapper h-96">
              <LineChart v-if="evolucionGastosData" :data="evolucionGastosData" :options="lineChartOptions" />
              <div v-else class="no-data-placeholder">No hay datos de evolución para mostrar.</div>
            </div>
          </section>
          <section class="section-container lg:col-span-2">
            <h2 class="section-title">Top Categorías (Filtro Actual)</h2>
            <div class="chart-container-wrapper h-96">
              <Bar v-if="topTiposGastoData" :data="topTiposGastoData" :options="barChartOptions" />
              <div v-else class="no-data-placeholder">No hay gastos por categoría para mostrar.</div>
            </div>
          </section>
        </div>

        <!-- Tabla de Resultados -->
        <section class="section-container">
          <h2 class="section-title">Detalle de Gastos Filtrados</h2>
          <div v-if="gastosFiltrados.length > 0" class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-100"><tr><th class="table-header">Fecha</th><th class="table-header">Responsable</th><th class="table-header">Tipo</th><th class="table-header">Descripción</th><th class="table-header text-right">Monto</th></tr></thead>
              <tbody class="divide-y divide-gray-200">
                <tr v-for="gasto in gastosFiltrados" :key="gasto.gasto_id" class="hover:bg-gray-50">
                  <td class="table-cell">{{ formatDate(gasto.fecha_gasto) }}</td>
                  <td class="table-cell font-medium text-gray-800">{{ gasto.responsable_gasto_nombre }}</td>
                  <td class="table-cell">{{ gasto.nombre_tipo_gasto }}</td>
                  <td class="table-cell max-w-xs truncate" :title="gasto.gasto_descripcion">{{ gasto.gasto_descripcion }}</td>
                  <td class="table-cell text-right font-bold">{{ formatCurrency(gasto.gasto_monto_total) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="no-data-placeholder py-10">No se encontraron gastos que coincidan con los criterios de búsqueda.</div>
        </section>
      </div>
    </div>
  </div>
</template>

<style>
.form-label { @apply block text-sm font-medium text-gray-700 mb-1; }
.form-input { @apply mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm; }
.section-title { @apply text-xl font-semibold text-gray-700 mb-4; }
.section-container { @apply bg-white p-6 rounded-xl shadow-lg border; }
.kpi-card { @apply bg-white p-6 rounded-xl shadow-lg border text-center; }
.kpi-label { @apply text-sm font-medium text-gray-500; }
.kpi-value { @apply text-3xl font-bold text-gray-800 mt-1; }
.chart-container-wrapper { @apply w-full relative; }
.no-data-placeholder { @apply flex justify-center items-center h-full text-center text-gray-500; }
.error-banner { @apply p-4 bg-red-50 text-red-700 border border-red-200 rounded-md; }
.table-header { @apply px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider; }
.table-cell { @apply px-4 py-4 whitespace-nowrap text-sm text-gray-600; }

/* Estilos para vue-select */
.v-select-filter {
  --vs-controls-color: #6b7280;
  --vs-border-color: #d1d5db;
  --vs-dropdown-bg: #ffffff;
  --vs-dropdown-option-bg: #ffffff;
  --vs-dropdown-option-color: #374151;
  --vs-dropdown-option-padding: 0.5rem 1rem;
  --vs-dropdown-option--active-bg: #3b82f6;
  --vs-dropdown-option--active-color: #ffffff;
  --vs-selected-bg: #3b82f6;
  --vs-selected-color: #ffffff;
  --vs-search-input-color: #4b5563;
  --vs-line-height: 1.5;
  --vs-font-size: 0.875rem;
}
</style>