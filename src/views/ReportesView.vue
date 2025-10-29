<script setup>
import { ref, onMounted, reactive, nextTick } from 'vue';
import { supabase } from '../supabaseClient.js';
import { useReportGenerator } from '../composables/useReportGenerator.js';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import PieChart from '../components/charts/PieChart.vue';
import LineChart from '../components/charts/LineChart.vue';

const loading = ref(true);
const error = ref(null);
const activeFilter = ref('30d');
const fechaDesde = ref('');
const fechaHasta = ref('');
const kpis = ref({ total_gastado_periodo: 0, rendiciones_abiertas: 0 });
const tableData = ref([]);
const pieChartRef = ref(null);
const lineChartRef = ref(null);
const { generateGastosExcel, generateUserReportPDF } = useReportGenerator();

const pieChartData = reactive({
  labels: [],
  datasets: [{
    backgroundColor: ['#004A99', '#007BFF', '#5A9BD5', '#ED7D31', '#A5A5A5', '#FFC000'],
    data: []
  }]
});

const lineChartData = reactive({
  labels: [],
  datasets: [{
    label: 'Gastos por Día',
    backgroundColor: '#007BFF',
    borderColor: '#004A99',
    tension: 0.1,
    data: []
  }]
});

async function loadReportData() {
  loading.value = true;
  error.value = null;
  try {
    const params = { p_fecha_desde: fechaDesde.value, p_fecha_hasta: fechaHasta.value };
    const [kpisResult, pieResult, lineResult] = await Promise.all([
      supabase.rpc('get_user_report_kpis', params),
      supabase.rpc('get_user_gastos_por_tipo_reporte', params),
      supabase.rpc('get_user_gastos_evolucion', params)
    ]);

    if (kpisResult.error) throw kpisResult.error;
    kpis.value = kpisResult.data;

    if (pieResult.error) throw pieResult.error;
    pieChartData.labels = pieResult.data.map(d => d.tipo_gasto_nombre);
    pieChartData.datasets[0].data = pieResult.data.map(d => d.total_monto);
    tableData.value = pieResult.data;

    if (lineResult.error) throw lineResult.error;
    lineChartData.labels = lineResult.data.map(d => formatDate(d.fecha, { day: '2-digit', month: '2-digit' }));
    lineChartData.datasets[0].data = lineResult.data.map(d => d.total_monto);
  } catch (e) {
    console.error("Error al cargar datos del reporte:", e);
    error.value = "No se pudieron cargar los datos para los reportes.";
  } finally {
    loading.value = false;
  }
}

function setFilter(periodo) {
  activeFilter.value = periodo;
  const hoy = new Date();
  let desde = new Date();
  let hasta = new Date();

  if (periodo === '7d') { desde.setDate(hoy.getDate() - 6); } 
  else if (periodo === '30d') { desde.setDate(hoy.getDate() - 29); } 
  else if (periodo === 'mesActual') { desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1); } 
  else if (periodo === 'mesAnterior') {
    desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    hasta = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
  }

  if (periodo !== 'custom') {
    fechaDesde.value = desde.toISOString().split('T')[0];
    fechaHasta.value = hasta.toISOString().split('T')[0];
  }
  loadReportData();
}

async function handleExportExcel() {
    alert("Preparando datos para la exportación a Excel...");
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuario no autenticado.");
        const { data, error } = await supabase.from('gastos').select('*, tipo_gasto_id(nombre_tipo_gasto)').eq('user_id', user.id).gte('fecha_gasto', fechaDesde.value).lte('fecha_gasto', fechaHasta.value);
        if (error) throw error;
        if (data && data.length > 0) {
            const gastosParaExportar = data.map(g => ({ ...g, tipo_gasto_nombre: g.tipo_gasto_id?.nombre_tipo_gasto || 'N/A' }));
            generateGastosExcel(gastosParaExportar, null, null, false);
        } else {
            alert("No hay gastos en el período seleccionado para exportar.");
        }
    } catch (e) {
        console.error("Error al exportar a Excel:", e);
        alert(`Error al exportar los datos: ${e.message}`);
    }
}

async function handleExportPDF() {
  // Llamamos al método expuesto por el componente hijo
  const pieChartInstance = pieChartRef.value?.getChartInstance();
  const lineChartInstance = lineChartRef.value?.getChartInstance();

  if (!pieChartInstance || !lineChartInstance) {
    alert("Los gráficos aún no están listos. Por favor, espere un momento e intente de nuevo.");
    console.error("Error de referencia: El método getChartInstance() no devolvió una instancia válida.");
    return;
  }
  try {
    const pieChartImage = pieChartInstance.canvas.toDataURL('image/png');
    const lineChartImage = lineChartInstance.canvas.toDataURL('image/png');
    
    const filterInfo = { fechaDesde: fechaDesde.value, fechaHasta: fechaHasta.value };
    generateUserReportPDF(kpis.value, tableData.value, pieChartImage, lineChartImage, filterInfo);
  } catch (e) {
    console.error("Error al generar el PDF:", e);
    alert(`Ocurrió un error al generar el PDF: ${e.message}`);
  }
}

onMounted(() => {
  setFilter('30d');
});
</script>
<template>
  <div class="container mx-auto px-4 py-8">
    <!-- Encabezado y Botones de Exportación -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
      <div>
        <h1 class="text-3xl font-bold text-districorr-text-primary">Mis Reportes</h1>
        <p class="text-lg text-districorr-text-secondary">Analiza tus gastos con filtros y visualizaciones.</p>
      </div>
      
      <!-- Contenedor para ambos botones de exportación -->
      <div class="flex items-center gap-x-3 mt-4 sm:mt-0">
        <button @click="handleExportPDF" class="btn-export-main bg-red-600 hover:bg-red-700 focus:ring-red-500">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2-2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd" /></svg>
          Exportar a PDF
        </button>
        <button @click="handleExportExcel" class="btn-export-main bg-green-600 hover:bg-green-700 focus:ring-green-500">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm2 3a1 1 0 00-1 1v6a1 1 0 001 1h12a1 1 0 001-1V9a1 1 0 00-1-1H4z" /></svg>
          Exportar a Excel
        </button>
      </div>
    </div>

    <!-- Filtros de Fecha -->
    <div class="bg-white p-4 rounded-xl shadow-md border border-gray-200/80 mb-8">
      <div class="flex flex-wrap items-center gap-2">
        <span class="font-semibold mr-2">Período:</span>
        <button @click="setFilter('7d')" :class="activeFilter === '7d' ? 'btn-view-active' : 'btn-view-inactive'" class="btn text-xs px-3 py-1.5">Últimos 7 días</button>
        <button @click="setFilter('30d')" :class="activeFilter === '30d' ? 'btn-view-active' : 'btn-view-inactive'" class="btn text-xs px-3 py-1.5">Últimos 30 días</button>
        <button @click="setFilter('mesActual')" :class="activeFilter === 'mesActual' ? 'btn-view-active' : 'btn-view-inactive'" class="btn text-xs px-3 py-1.5">Este Mes</button>
        <button @click="setFilter('mesAnterior')" :class="activeFilter === 'mesAnterior' ? 'btn-view-active' : 'btn-view-inactive'" class="btn text-xs px-3 py-1.5">Mes Anterior</button>
        <div class="flex items-center gap-2 border-l pl-3 ml-2">
          <input type="date" v-model="fechaDesde" @change="setFilter('custom')" class="p-1.5 border rounded-md text-sm">
          <span class="text-gray-500">-</span>
          <input type="date" v-model="fechaHasta" @change="setFilter('custom')" class="p-1.5 border rounded-md text-sm">
        </div>
      </div>
    </div>

    <!-- Contenido Principal -->
    <div v-if="loading" class="text-center py-16">
      <svg class="animate-spin h-10 w-10 text-districorr-primary mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
      <p class="mt-4 text-lg text-gray-600">Actualizando reportes...</p>
    </div>
    <div v-else-if="error" class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md" role="alert">
      <p class="font-bold">Ocurrió un error</p><p>{{ error }}</p>
    </div>
    <div v-else class="space-y-8">
      <!-- KPIs -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-white p-6 rounded-xl shadow-md border"><h3 class="text-lg font-semibold text-districorr-text-secondary mb-2">Total Gastado (Período)</h3><p class="text-4xl font-bold text-districorr-primary">{{ formatCurrency(kpis.total_gastado_periodo, 'ARS') }}</p></div>
        <div class="bg-white p-6 rounded-xl shadow-md border"><h3 class="text-lg font-semibold text-districorr-text-secondary mb-2">Rendiciones Abiertas</h3><p class="text-4xl font-bold text-districorr-primary">{{ kpis.rendiciones_abiertas }}</p></div>
      </div>

      <!-- Gráficos -->
      <div class="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div class="lg:col-span-2 bg-white p-6 rounded-xl shadow-md border">
          <h3 class="text-xl font-semibold text-center mb-4">Gastos por Tipo</h3>
          <div v-if="pieChartData.datasets[0].data.length > 0" class="h-[400px]"><PieChart ref="pieChartRef" :chart-data="pieChartData" /></div>
          <div v-else class="flex items-center justify-center h-[400px] text-center text-gray-500">No hay datos para este período.</div>
        </div>
        <div class="lg:col-span-3 bg-white p-6 rounded-xl shadow-md border">
          <h3 class="text-xl font-semibold text-center mb-4">Evolución de Gastos</h3>
          <div v-if="lineChartData.datasets[0].data.length > 0" class="h-[400px]"><LineChart ref="lineChartRef" :chart-data="lineChartData" /></div>
          <div v-else class="flex items-center justify-center h-[400px] text-center text-gray-500">No hay datos para este período.</div>
        </div>
      </div>

      <!-- Tabla de Datos -->
      <div class="bg-white rounded-xl shadow-md border overflow-hidden">
        <h3 class="text-xl font-semibold p-6">Detalle de Gastos por Tipo</h3>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50"><tr><th scope="col" class="table-th">Tipo de Gasto</th><th scope="col" class="table-th text-right">Monto Total</th></tr></thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-if="tableData.length === 0"><td colspan="2" class="px-6 py-12 text-center text-gray-500">No hay gastos para mostrar en el período seleccionado.</td></tr>
              <tr v-for="item in tableData" :key="item.tipo_gasto_nombre">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ item.tipo_gasto_nombre }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 text-right">{{ formatCurrency(item.total_monto, 'ARS') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped>
/* Estilos para los botones de filtro. Puedes moverlos a tu style.css global si los reutilizas */
.btn {
  @apply rounded-md font-semibold transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2;
}
.btn-view-active {
  @apply bg-districorr-primary text-white shadow-md ring-2 ring-districorr-primary;
}
.btn-view-inactive {
  @apply bg-gray-200 text-gray-700 hover:bg-gray-300 focus:ring-gray-400;
}

/* Estilos para los botones de exportación */
.btn-export-main {
  @apply px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm hover:bg-opacity-85 transition-colors flex items-center focus:outline-none focus:ring-2 focus:ring-offset-2;
}

/* Estilos para la tabla */
.table-th {
  @apply px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider;
}
</style>