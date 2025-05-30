<script setup> 
import { ref, onMounted, computed, watch } from 'vue';
import { supabase } from '../../supabaseClient.js';
import { RouterLink } from 'vue-router';
import { formatCurrency, formatDate } from '../../utils/formatters.js';

// Importaciones para Chart.js y vue-chartjs
import { Pie, Line as LineChart } from 'vue-chartjs';
import { 
  Chart as ChartJS, 
  Title, 
  Tooltip, 
  Legend, 
  ArcElement, 
  CategoryScale, 
  LinearScale,   
  PointElement,  
  LineElement,
  Filler
} from 'chart.js';

ChartJS.register(Title, Tooltip, Legend, ArcElement, CategoryScale, LinearScale, PointElement, LineElement, Filler);

// --- KPIs ---
const kpiTotalGastadoGlobal = ref(null);
const kpiRendicionesPendientes = ref(null);
const kpiResponsablesActivos = ref(null);
const loadingKPIs = ref(true);
const errorKPIs = ref('');

// --- Estado para Gráfico de Gastos por Tipo (Pie Chart) ---
const chartDataGastosPorTipo = ref(null);
const isLoadingChartGastosPorTipo = ref(true);
const chartErrorGastosPorTipo = ref('');
const periodoSeleccionadoPieChart = ref('mensual');
const fechaInicioPieChartPersonalizado = ref('');
const fechaFinPieChartPersonalizado = ref('');
const chartOptionsGastosPorTipo = ref({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top' },
    title: { display: true, text: 'Distribución de Gastos por Tipo (ARS)', font: { size: 16 } },
    tooltip: {
      callbacks: {
        label: function(context) {
          let label = context.label || '';
          if (label) { label += ': '; }
          if (context.raw !== null && typeof context.raw === 'number') {
             label += formatCurrency(context.raw, 'ARS'); 
          } else if (context.formattedValue) { 
             label += context.formattedValue;
          }
          return label;
        }
      }
    }
  }
});

// --- Estado para Gráfico de Evolución de Gastos (Line Chart) ---
const chartDataEvolucionGastos = ref(null);
const isLoadingEvolucionGastos = ref(true);
const chartErrorEvolucionGastos = ref('');
const periodoSeleccionadoEvolucion = ref('mes'); // 'mes', 'dia' (para el agrupador de la RPC)
const fechaInicioEvolucion = ref(''); 
const fechaFinEvolucion = ref('');   

const chartOptionsEvolucionGastos = ref({
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    y: { beginAtZero: true, ticks: { callback: value => formatCurrency(value, 'ARS') } },
    x: { title: { display: true, text: 'Período' } }
  },
  plugins: {
    legend: { display: false },
    title: { display: true, text: 'Evolución de Gastos (ARS)' }, 
    tooltip: {
      callbacks: {
        label: function(context) {
          let label = context.dataset.label || '';
          if (label) { label += ': '; }
          if (context.parsed.y !== null) { label += formatCurrency(context.parsed.y, 'ARS'); }
          return label;
        }
      }
    }
  }
});

// --- Funciones de Carga de Datos ---
async function fetchAdminDashboardData() {
  console.log("AdminDashboardView: Iniciando fetchAdminDashboardData para KPIs...");
  loadingKPIs.value = true; errorKPIs.value = '';
  kpiTotalGastadoGlobal.value = null; kpiRendicionesPendientes.value = null; kpiResponsablesActivos.value = null;
  try {
    const [totalResult, pendientesResult, activosResult] = await Promise.all([
      supabase.rpc('get_total_gastado_global'),
      supabase.rpc('get_count_rendiciones_pendientes'),
      supabase.rpc('get_count_responsables_activos', { dias_atras: 30 })
    ]);

    if (totalResult.error) { console.error("Error RPC (get_total_gastado_global):", totalResult.error); errorKPIs.value += `Total gastado: ${totalResult.error.message}\n`; } 
    else { kpiTotalGastadoGlobal.value = totalResult.data; } 

    if (pendientesResult.error) { console.error("Error RPC (get_count_rendiciones_pendientes):", pendientesResult.error); errorKPIs.value += `Rend. pendientes: ${pendientesResult.error.message}\n`; } 
    else { kpiRendicionesPendientes.value = pendientesResult.data; } 
    
    if (activosResult.error) { console.error("Error RPC (get_count_responsables_activos):", activosResult.error); errorKPIs.value += `Resp. activos: ${activosResult.error.message}\n`; } 
    else { kpiResponsablesActivos.value = activosResult.data; } 

  } catch (error) {
    console.error("AdminDashboardView: Error general en fetchAdminDashboardData:", error.message);
    errorKPIs.value = `Error general al cargar KPIs: ${error.message}`;
  } finally {
    loadingKPIs.value = false;
  }
}

const formatDateForRPC = (dateStrOrObj) => {
  if (!dateStrOrObj) return null;
  if (dateStrOrObj instanceof Date) { return dateStrOrObj.toISOString().split('T')[0]; }
  return dateStrOrObj; 
};

// Función para cargar y formatear datos para el gráfico de gastos por tipo (PIE CHART)
async function fetchChartDataGastosPorTipo(fechaInicio = null, fechaFin = null) {
  isLoadingChartGastosPorTipo.value = true; chartErrorGastosPorTipo.value = '';
  
  const params = { // RPC get_gastos_por_tipo_en_periodo NO usa 'agrupador'
      fecha_inicio: formatDateForRPC(fechaInicio),
      fecha_fin: formatDateForRPC(fechaFin) 
  };
  console.log("AdminDashboardView: fetchChartDataGastosPorTipo - RPC 'get_gastos_por_tipo_en_periodo' con:", params);
  try {
    const { data, error } = await supabase.rpc('get_gastos_por_tipo_en_periodo', params); 
    if (error) throw error;
    if (data && data.length > 0) {
      const labels = data.map(item => item.nombre_tipo || 'Desconocido');
      const chartValues = data.map(item => parseFloat(item.total_gastado_bruto) || 0);
      const colorPalette = ['rgba(255, 99, 132, 0.7)', 'rgba(54, 162, 235, 0.7)', 'rgba(255, 206, 86, 0.7)', 'rgba(75, 192, 192, 0.7)', 'rgba(153, 102, 255, 0.7)', 'rgba(255, 159, 64, 0.7)', 'rgba(199, 199, 199, 0.7)'];
      const backgroundColors = data.map((_, index) => colorPalette[index % colorPalette.length]);
      chartDataGastosPorTipo.value = { labels, datasets: [{ data: chartValues, backgroundColor: backgroundColors, borderColor: '#fff', borderWidth: 1 }] };
    } else {
      chartDataGastosPorTipo.value = { labels: ['Sin datos para el período'], datasets: [{ data: [1], backgroundColor: ['#E0E0E0'] }] };
    }
  } catch (error) {
    console.error("Error cargando datos para Pie Chart:", error.message);
    chartErrorGastosPorTipo.value = `Error al cargar gráfico: ${error.details || error.message}`; chartDataGastosPorTipo.value = null;
  } finally { isLoadingChartGastosPorTipo.value = false; }
}

function cargarDatosPieChartSegunPeriodo() {
  let inicio = null, fin = null; const hoy = new Date();
  if (periodoSeleccionadoPieChart.value === 'semanal') {
    const haceUnaSemana = new Date(hoy); haceUnaSemana.setDate(hoy.getDate() - 6);
    inicio = haceUnaSemana; fin = hoy;
  } else if (periodoSeleccionadoPieChart.value === 'mensual') {
    inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1); fin = hoy;
  } else if (periodoSeleccionadoPieChart.value === 'personalizado') {
    if (fechaInicioPieChartPersonalizado.value && fechaFinPieChartPersonalizado.value) {
      inicio = fechaInicioPieChartPersonalizado.value; fin = fechaFinPieChartPersonalizado.value;
    } else { chartErrorGastosPorTipo.value = "Seleccione un rango de fechas."; chartDataGastosPorTipo.value = { labels: ['Seleccione rango'], datasets: [{ data: [1], backgroundColor: ['#E0E0E0']}]}; return; }
  }
  fetchChartDataGastosPorTipo(inicio, fin);
}

// Función para cargar y formatear datos para el gráfico de EVOLUCIÓN DE GASTOS (LINE CHART)
async function fetchEvolucionGastosData(fechaInicio, fechaFin, agrupador) {
  isLoadingEvolucionGastos.value = true; chartErrorEvolucionGastos.value = '';
  const params = {
    p_fecha_inicio: formatDateForRPC(fechaInicio) || null, // Usar p_ para coincidir con RPC
    p_fecha_fin: formatDateForRPC(fechaFin) || null,     // Usar p_
    p_agrupador: agrupador                               // Usar p_
  };
  console.log("AdminDashboardView: fetchEvolucionGastosData - RPC 'get_evolucion_gastos_ars' con:", params);
  try {
    const { data, error } = await supabase.rpc('get_evolucion_gastos_ars', params);
    if (error) throw error; 
    if (data && data.length > 0) {
      const labels = data.map(item => item.periodo_label);
      const chartValues = data.map(item => parseFloat(item.total_gastado_bruto) || 0);
      chartDataEvolucionGastos.value = {
        labels,
        datasets: [{
            label: 'Total Gastado (ARS)', backgroundColor: 'rgba(54, 162, 235, 0.5)', borderColor: 'rgb(54, 162, 235)',
            borderWidth: 2, tension: 0.1, data: chartValues, fill: true,
        }]
      };
      let periodoTexto = agrupador === 'mes' ? 'Mensual' : 'Diaria';
      let rangoTexto = '';
      // Usar los valores originales de las refs para el título, no los formateados para RPC
      const inicioOriginalParaTitulo = fechaInicioEvolucion.value; 
      const finOriginalParaTitulo = fechaFinEvolucion.value;

      if (inicioOriginalParaTitulo && finOriginalParaTitulo) {
          rangoTexto = ` (${formatDate(inicioOriginalParaTitulo)} - ${formatDate(finOriginalParaTitulo)})`;
      } else if (inicioOriginalParaTitulo) {
         rangoTexto = ` (Desde ${formatDate(inicioOriginalParaTitulo)})`;
      } else if (finOriginalParaTitulo) {
         rangoTexto = ` (Hasta ${formatDate(finOriginalParaTitulo)})`;
      } else {
        if (agrupador === 'mes') rangoTexto = " (Últimos 12 meses por defecto)";
        else if (agrupador === 'dia') rangoTexto = " (Rango por defecto de RPC)";
      }
      chartOptionsEvolucionGastos.value.plugins.title.text = `Evolución de Gastos ${periodoTexto}${rangoTexto} (ARS)`;
    } else {
      chartDataEvolucionGastos.value = { labels: ['Sin datos para el período/agrupador'], datasets: [{ data: [] }]};
      chartOptionsEvolucionGastos.value.plugins.title.text = `Evolución de Gastos (ARS) - Sin Datos`;
    }
  } catch (error) {
    console.error("Error cargando datos para Line Chart:", error.message);
    chartErrorEvolucionGastos.value = `Error al cargar gráfico de evolución: ${error.details || error.message}`; 
    chartDataEvolucionGastos.value = null;
  } finally { isLoadingEvolucionGastos.value = false; }
}

function cargarDatosEvolucionConFiltros() {
    // Los valores de fechaInicioEvolucion.value y fechaFinEvolucion.value ya son strings YYYY-MM-DD o ''
    fetchEvolucionGastosData(fechaInicioEvolucion.value, fechaFinEvolucion.value, periodoSeleccionadoEvolucion.value);
}

// Watchers
watch([periodoSeleccionadoPieChart, fechaInicioPieChartPersonalizado, fechaFinPieChartPersonalizado], 
  () => {
    if (periodoSeleccionadoPieChart.value === 'personalizado') {
      if (fechaInicioPieChartPersonalizado.value && fechaFinPieChartPersonalizado.value) {
        cargarDatosPieChartSegunPeriodo();
      }
    } else {
      cargarDatosPieChartSegunPeriodo();
    }
  }, { deep: false }
);

watch(periodoSeleccionadoEvolucion, (newValue, oldValue) => {
    if(oldValue !== undefined){ 
        cargarDatosEvolucionConFiltros();
    }
});
// No se necesita un watch para fechaInicioEvolucion/fechaFinEvolucion si se usa un botón "Aplicar"

onMounted(() => {
  console.log("AdminDashboardView: Componente MONTADO.");
  fetchAdminDashboardData(); 
  cargarDatosPieChartSegunPeriodo(); 

  fechaInicioEvolucion.value = ''; 
  fechaFinEvolucion.value = '';     
  periodoSeleccionadoEvolucion.value = 'mes';
  cargarDatosEvolucionConFiltros();
});
</script>
<template>
  <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="mb-10">
      <h1 class="text-3xl sm:text-4xl font-bold text-districorr-primary tracking-tight">
        Panel de Administración
      </h1>
      <p class="mt-2 text-lg text-districorr-text-medium">
        Gestión centralizada y resumen de actividad de Districorr InfoGastos.
      </p>
    </div>

    <!-- Sección de Módulos de Gestión -->
    <section class="mb-12">
      <h2 class="section-title">
        Módulos de Gestión
      </h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 xl:gap-8">
        <router-link :to="{ name: 'AdminTiposGastoGlobales' }" class="module-card border-districorr-accent group">
          <div class="module-card-icon bg-districorr-accent/10 text-districorr-accent"><svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.53 0 1.002.211 1.352.56C13.702 3.91 14 4.418 14 5v2h3a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2h3V5c0-.582.298-1.09.648-1.44C6.002 3.21 6.47 3 7 3zm0 14v-2" /></svg></div>
          <div><h3 class="module-card-title group-hover:text-districorr-accent">Tipos de Gasto</h3><p class="module-card-description">Administrar categorías globales de gastos.</p></div>
        </router-link>
        <router-link :to="{ name: 'AdminFormatosGasto' }" class="module-card border-blue-500 group">
          <div class="module-card-icon bg-blue-500/10 text-blue-600 group-hover:bg-blue-500"><svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div>
          <div><h3 class="module-card-title group-hover:text-blue-600">Formatos de Gasto</h3><p class="module-card-description">Configurar plantillas y campos dinámicos.</p></div>
        </router-link>
        <router-link :to="{ name: 'AdminViajesList' }" class="module-card border-teal-500 group">
          <div class="module-card-icon bg-teal-500/10 text-teal-600 group-hover:bg-teal-500"><svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16m-4-1v-1h-4v1m0-4h4M3 12h18M3 6h18M3 18h18" /></svg></div>
          <div><h3 class="module-card-title group-hover:text-teal-600">Todos los Viajes</h3><p class="module-card-description">Visualizar y supervisar todas las rendiciones.</p></div>
        </router-link>
      </div>
    </section>

    <!-- Sección de KPIs -->
    <section class="mb-12">
      <h2 class="section-title">Resumen y Estadísticas Clave</h2>
      <div class="section-container">
        <div v-if="errorKPIs" class="error-banner mb-6"><p class="font-medium">Error al cargar KPIs:</p><p class="whitespace-pre-line">{{ errorKPIs }}</p></div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div class="kpi-card"><p class="kpi-label">Total Gastado (Global ARS)</p><div v-if="loadingKPIs" class="kpi-loading">CARGANDO...</div><div v-else><p class="kpi-value">{{ kpiTotalGastadoGlobal !== null ? formatCurrency(kpiTotalGastadoGlobal, 'ARS') : 'N/A' }}</p><p class="kpi-description">Suma de todos los gastos registrados.</p></div></div>
          <div class="kpi-card"><p class="kpi-label">Rendiciones Pendientes</p><div v-if="loadingKPIs" class="kpi-loading">CARGANDO...</div><div v-else><p class="kpi-value">{{ kpiRendicionesPendientes !== null ? kpiRendicionesPendientes : 'N/A' }}</p><p class="kpi-description">Períodos actualmente en curso (no cerrados).</p></div></div>
          <div class="kpi-card"><p class="kpi-label">Responsables Activos</p><div v-if="loadingKPIs" class="kpi-loading">CARGANDO...</div><div v-else><p class="kpi-value">{{ kpiResponsablesActivos !== null ? kpiResponsablesActivos : 'N/A' }}</p><p class="kpi-description">Usuarios con gastos en los últimos 30 días.</p></div></div>
        </div>
      </div>
    </section>

    <!-- Gráfico de Gastos por Tipo (Pie Chart) -->
    <section class="mb-12">
        <h2 class="section-title">Análisis de Gastos por Tipo</h2>
        <div class="section-container">
            <div class="mb-6 flex flex-wrap items-end gap-x-4 gap-y-2">
                <div>
                    <label class="filter-label">Período (Gráfico Torta):</label>
                    <div class="btn-group">
                        <button @click="periodoSeleccionadoPieChart = 'semanal'" :class="periodoSeleccionadoPieChart === 'semanal' ? 'btn-filter-active' : 'btn-filter'">Semanal</button>
                        <button @click="periodoSeleccionadoPieChart = 'mensual'" :class="periodoSeleccionadoPieChart === 'mensual' ? 'btn-filter-active' : 'btn-filter'">Mensual</button>
                        <button @click="periodoSeleccionadoPieChart = 'personalizado'" :class="periodoSeleccionadoPieChart === 'personalizado' ? 'btn-filter-active' : 'btn-filter'">Personalizado</button>
                    </div>
                </div>
                <div v-if="periodoSeleccionadoPieChart === 'personalizado'" class="flex items-end gap-x-4 gap-y-2 flex-wrap sm:flex-nowrap">
                    <div><label for="fechaInicioPieChart" class="filter-label">Desde:</label><input type="date" id="fechaInicioPieChart" v-model="fechaInicioPieChartPersonalizado" class="input-form-style-charts"></div>
                    <div><label for="fechaFinPieChart" class="filter-label">Hasta:</label><input type="date" id="fechaFinPieChart" v-model="fechaFinPieChartPersonalizado" class="input-form-style-charts"></div>
                </div>
            </div>
            <div class="chart-container-wrapper"><div v-if="isLoadingChartGastosPorTipo" class="loading-placeholder"><svg class="animate-spin h-8 w-8 text-districorr-primary mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Cargando...</div><div v-else-if="chartErrorGastosPorTipo" class="error-banner text-sm"><p class="font-semibold">Error:</p><p>{{ chartErrorGastosPorTipo }}</p></div><Pie v-else-if="chartDataGastosPorTipo && chartDataGastosPorTipo.datasets && chartDataGastosPorTipo.datasets.length > 0 && !(chartDataGastosPorTipo.labels && (chartDataGastosPorTipo.labels[0] === 'Sin datos para el período' || chartDataGastosPorTipo.labels[0] === 'Seleccione rango'))" :data="chartDataGastosPorTipo" :options="chartOptionsGastosPorTipo" id="gastosPorTipoPieChart"/> <div v-else class="no-data-placeholder"><p>No hay datos para mostrar en el gráfico de torta.</p></div></div>
        </div>
    </section>

    <!-- Gráfico de Evolución de Gastos (Line Chart) -->
    <section class="mb-12">
        <h2 class="section-title">Evolución de Gastos</h2>
        <div class="section-container">
            <div class="mb-6 flex flex-wrap items-end gap-x-4 gap-y-2">
                <div>
                    <label class="filter-label">Agrupar por:</label>
                    <div class="btn-group">
                        <button @click="periodoSeleccionadoEvolucion = 'dia'" :class="periodoSeleccionadoEvolucion === 'dia' ? 'btn-filter-active' : 'btn-filter'">Día</button>
                        <button @click="periodoSeleccionadoEvolucion = 'mes'" :class="periodoSeleccionadoEvolucion === 'mes' ? 'btn-filter-active' : 'btn-filter'">Mes</button>
                    </div>
                </div>
                <div class="flex items-end gap-x-4 gap-y-2 flex-wrap sm:flex-nowrap">
                     <div><label for="fechaInicioEvolucion" class="filter-label">Desde (Evolución):</label><input type="date" id="fechaInicioEvolucion" v-model="fechaInicioEvolucion" class="input-form-style-charts"></div>
                     <div><label for="fechaFinEvolucion" class="filter-label">Hasta (Evolución):</label><input type="date" id="fechaFinEvolucion" v-model="fechaFinEvolucion" class="input-form-style-charts"></div>
                </div>
                <button @click="cargarDatosEvolucionConFiltros" class="btn-primary self-end">Aplicar Filtros Gráfico</button>
            </div>
            <div class="chart-container-wrapper"><div v-if="isLoadingEvolucionGastos" class="loading-placeholder"><svg class="animate-spin h-8 w-8 text-districorr-primary mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Cargando...</div><div v-else-if="chartErrorEvolucionGastos" class="error-banner text-sm"><p class="font-semibold">Error:</p><p>{{ chartErrorEvolucionGastos }}</p></div><LineChart v-else-if="chartDataEvolucionGastos && chartDataEvolucionGastos.datasets && chartDataEvolucionGastos.datasets.length > 0 && chartDataEvolucionGastos.labels && chartDataEvolucionGastos.labels[0] !== 'Sin datos para el período/agrupador'" :data="chartDataEvolucionGastos" :options="chartOptionsEvolucionGastos" id="evolucionGastosLineChart"/> <div v-else class="no-data-placeholder"><p>No hay datos para mostrar en el gráfico de evolución.</p></div></div>
        </div>
    </section>

  </div>
</template>

<style scoped>
/* Estilos Generales para el Dashboard */
.section-title { @apply text-2xl font-semibold text-gray-800 mb-6 border-b-2 border-gray-200 pb-3; }
.section-container { @apply bg-white p-6 rounded-xl shadow-lg border border-gray-200/80; }
.filter-label { @apply block text-xs font-medium text-gray-600 mb-1; }
.input-form-style-charts { @apply mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-districorr-accent focus:ring focus:ring-districorr-accent focus:ring-opacity-50 sm:text-sm py-2 px-3; }
.btn-group { @apply flex rounded-md shadow-sm; }
.btn-filter { @apply relative inline-flex items-center px-4 py-2 border border-gray-300 bg-gray-100 text-sm font-medium text-gray-700 hover:bg-gray-200 focus:z-10 focus:outline-none focus:ring-1 focus:ring-districorr-accent focus:border-districorr-accent transition-colors; }
.btn-filter:first-child { @apply rounded-l-md; }
.btn-filter:last-child { @apply rounded-r-md; }
.btn-filter:not(:first-child) { @apply -ml-px; } /* Evita doble borde en el medio */
.btn-filter-active { @apply relative inline-flex items-center px-4 py-2 border border-districorr-primary bg-districorr-primary text-sm font-medium text-white z-10 focus:outline-none focus:ring-1 focus:ring-districorr-accent focus:border-districorr-accent transition-colors; }
.btn-primary { @apply px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-districorr-primary hover:bg-opacity-85 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-districorr-accent transition-colors; }
.chart-container-wrapper { @apply h-80 md:h-96 w-full max-w-2xl mx-auto relative; }
.loading-placeholder { @apply flex justify-center items-center h-full text-gray-500; }
.no-data-placeholder { @apply flex justify-center items-center h-full text-center text-gray-500 py-10; }
.error-banner { @apply p-4 bg-red-50 text-red-700 border border-red-200 rounded-md; }

/* KPIs */
.kpi-card { @apply p-5 bg-gray-50 rounded-lg shadow-md border border-gray-200 hover:border-gray-300 transition-colors; }
.kpi-label { @apply text-sm font-medium text-gray-500 uppercase tracking-wider; }
.kpi-value { @apply text-3xl font-bold text-districorr-primary mt-1.5; }
.kpi-description { @apply text-xs text-gray-500 mt-1; }
.kpi-loading { @apply mt-1.5 text-3xl font-bold text-gray-300 animate-pulse; }

/* Módulos de Gestión */
.module-card { @apply block p-6 bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1.5 border-l-4; }
.module-card-icon { @apply flex-shrink-0 p-3.5 rounded-full group-hover:text-white transition-colors duration-200; }
.module-card-title { @apply text-lg font-semibold text-districorr-primary transition-colors duration-200; }
.module-card-description { @apply text-sm text-gray-600 mt-1; }
.group:hover .group-hover\:text-white { color: white !important; }
.group:hover .group-hover\:bg-districorr-accent { background-color: var(--color-districorr-accent, #2563eb) !important; }
.group:hover .group-hover\:bg-blue-500 { background-color: #3b82f6 !important; }
.group:hover .group-hover\:bg-teal-500 { background-color: #14b8a6 !important; }
</style>