<script setup>
import { ref, onMounted, computed } from 'vue';
import { supabase } from '../../supabaseClient.js';
import { formatCurrency, formatDate } from '../../utils/formatters.js';
import { Bar, Line as LineChart } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, PointElement, LineElement, Filler, TimeScale } from 'chart.js';
import 'chartjs-adapter-date-fns';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// --- ¡LA CORRECCIÓN ESTÁ AQUÍ! ---
// Registramos todos los componentes necesarios, incluyendo TimeScale para los ejes de fecha.
ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, PointElement, LineElement, Filler, TimeScale);

// --- Estado General ---
const loading = ref(true);
const error = ref('');
const exportandoPDF = ref(false);

// --- Estado de Filtros ---
const fechaDesde = ref(new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0]);
const fechaHasta = ref(new Date().toISOString().split('T')[0]);
const agrupadorEvolucion = ref('day');

// --- Estado de Datos para Gráficos ---
const lineChartData = ref(null);
const barChartData = ref(null);
const topGastadoresChartData = ref(null);
const topClientesChartData = ref(null);
const topTransportesChartData = ref(null);

// --- Estado de Datos para KPIs y Tablas ---
const kpis = ref({
  promedioMensual: 0,
  previsionSiguienteMes: 0,
  categoriaPrincipal: { tipo: 'N/A', total: 0 },
  totalGastadoPeriodo: 0,
});
const rawData = ref({
  evolucion: [],
  categorias: [],
  responsables: [],
  clientes: [],
  transportes: []
});

// --- Opciones de Gráficos ---
const lineChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      type: 'time',
      time: { unit: agrupadorEvolucion.value },
      title: { display: true, text: 'Período' }
    },
    y: { ticks: { callback: value => formatCurrency(value, 'ARS', 0) } }
  },
  plugins: {
    legend: { display: false },
    title: { display: true, text: `Evolución de Gastos por ${agrupadorEvolucion.value}` },
    tooltip: { callbacks: { label: ctx => `${ctx.dataset.label || ''}: ${formatCurrency(ctx.parsed.y)}` } }
  }
}));

const barChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    title: { display: true, text: 'Top 7 Categorías de Gasto (Histórico)' },
    tooltip: { callbacks: { label: ctx => formatCurrency(ctx.raw) } }
  },
};

const horizontalBarOptions = {
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { callbacks: { label: ctx => formatCurrency(ctx.raw) } }
  },
};

// --- Lógica de Carga de Datos ---
async function loadAllAnalyticsData() {
  if (!fechaDesde.value || !fechaHasta.value) {
    error.value = "Por favor, seleccione un rango de fechas válido.";
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const [
      evolucionResult,
      categoriasResult,
      responsablesResult,
      clientesResult,
      transportesResult,
      promedioResult,
      previsionResult
    ] = await Promise.all([
      supabase.rpc('get_evolucion_gastos', { p_fecha_inicio: fechaDesde.value, p_fecha_fin: fechaHasta.value, p_agrupador: agrupadorEvolucion.value }),
      supabase.rpc('get_top_tipos_gasto'),
      supabase.rpc('get_top_gastadores', { limite: 5 }),
      supabase.rpc('get_top_clientes_por_gasto', { limite: 5 }),
      supabase.rpc('get_top_transportes_por_gasto', { limite: 5 }),
      supabase.rpc('get_kpi_promedio_mensual'),
      supabase.rpc('get_prevision_gasto_siguiente_mes')
    ]);

    const results = [evolucionResult, categoriasResult, responsablesResult, clientesResult, transportesResult, promedioResult, previsionResult];
    for (const result of results) {
      if (result.error) throw result.error;
    }

    // Procesar datos de Evolución
    const evolucionData = evolucionResult.data || [];
    if (evolucionData.length > 0) {
      lineChartData.value = {
        datasets: [{
          label: 'Total Gastado',
          data: evolucionData.map(item => ({ x: item.periodo_label, y: item.total_gastado })),
          borderColor: '#3498DB', backgroundColor: 'rgba(52, 152, 219, 0.2)', fill: true, tension: 0.3
        }]
      };
      kpis.value.totalGastadoPeriodo = evolucionData.reduce((acc, item) => acc + parseFloat(item.total_gastado), 0);
    } else {
      lineChartData.value = null;
      kpis.value.totalGastadoPeriodo = 0;
    }

    // Procesar datos de Top Categorías
    const categoriasData = categoriasResult.data || [];
    if (categoriasData.length > 0) {
      barChartData.value = {
        labels: categoriasData.map(item => item.tipo_gasto),
        datasets: [{
          label: 'Gasto Total', data: categoriasData.map(item => item.total_gastado),
          backgroundColor: '#3498DB', borderRadius: 4
        }]
      };
      kpis.value.categoriaPrincipal = { tipo: categoriasData[0].tipo_gasto, total: parseFloat(categoriasData[0].total_gastado) };
    }

    // Procesar datos de Top Responsables
    const responsablesData = responsablesResult.data || [];
    if (responsablesData.length > 0) {
      topGastadoresChartData.value = {
        labels: responsablesData.map(item => item.nombre_responsable),
        datasets: [{
          label: 'Gasto Total', data: responsablesData.map(item => item.total_gastado),
          backgroundColor: '#2ECC71', borderRadius: 4
        }]
      };
    }

    // Procesar datos de Top Clientes
    const clientesData = clientesResult.data || [];
    if (clientesData.length > 0) {
      topClientesChartData.value = {
        labels: clientesData.map(item => item.nombre_cliente),
        datasets: [{
          label: 'Gasto Asociado', data: clientesData.map(item => item.total_gastado),
          backgroundColor: '#F39C12', borderRadius: 4
        }]
      };
    }

    // Procesar datos de Top Transportes
    const transportesData = transportesResult.data || [];
    if (transportesData.length > 0) {
      topTransportesChartData.value = {
        labels: transportesData.map(item => item.nombre_transporte),
        datasets: [{
          label: 'Gasto Asociado', data: transportesData.map(item => item.total_gastado),
          backgroundColor: '#9B59B6', borderRadius: 4
        }]
      };
    }

    // Asignar KPIs
    kpis.value.promedioMensual = promedioResult.data || 0;
    kpis.value.previsionSiguienteMes = previsionResult.data || 0;

  } catch (e) {
    console.error("Error cargando datos de analíticas:", e);
    error.value = 'No se pudieron cargar los datos. Revisa las funciones RPC y los filtros.';
  } finally {
    loading.value = false;
  }
}

onMounted(loadAllAnalyticsData);

async function exportarAPDF() {
  exportandoPDF.value = true;
  
  // Referencias a los contenedores de los gráficos
  const elementsToCapture = {
    line: document.getElementById('line-chart-container'),
    bar: document.getElementById('bar-chart-container'),
    topGastadores: document.getElementById('top-gastadores-chart-container'),
    topClientes: document.getElementById('top-clientes-chart-container'),
    topTransportes: document.getElementById('top-transportes-chart-container'),
  };

  // Capturamos todos los gráficos en paralelo
  const canvases = {};
  for (const key in elementsToCapture) {
    if (elementsToCapture[key]) {
      canvases[key] = await html2canvas(elementsToCapture[key], { scale: 2, backgroundColor: null });
    }
  }

  try {
    const doc = new jsPDF('p', 'pt', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    let currentY = 0;

    // --- FUNCIÓN HELPER PARA ENCABEZADO Y PIE DE PÁGINA ---
    const addHeaderAndFooter = () => {
      // Encabezado
      doc.setFillColor(13, 47, 91); // Color azul oscuro de la marca
      doc.rect(0, 0, pageWidth, 60, 'F');
      doc.setFontSize(20).setFont(undefined, 'bold').setTextColor(255, 255, 255);
      doc.text("Reporte de Analíticas de Gastos", pageWidth / 2, 35, { align: 'center' });
      
      // Pie de página
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8).setTextColor(150);
        doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, pageHeight - 20, { align: 'right' });
        doc.text('Districorr InfoGastos - Reporte Confidencial', margin, pageHeight - 20);
      }
    };

    // --- PÁGINA 1 ---
    currentY = 80; // Empezamos debajo del header
    doc.setFontSize(10).setFont(undefined, 'normal').setTextColor(100);
    doc.text(`Período de Evolución: ${formatDate(fechaDesde.value)} al ${formatDate(fechaHasta.value)}`, margin, currentY);
    currentY += 30;

    // KPIs
    doc.setFontSize(14).setFont(undefined, 'bold').setTextColor(0);
    doc.text("Indicadores Clave", margin, currentY);
    currentY += 15;
    doc.autoTable({
      startY: currentY,
      head: [['Métrica', 'Valor']],
      body: [
        ['Gasto Total en Período', formatCurrency(kpis.value.totalGastadoPeriodo)],
        ['Gasto Promedio Mensual (Histórico)', formatCurrency(kpis.promedioMensual)],
        ['Previsión Próximo Mes (Prom. 3m)', formatCurrency(kpis.value.previsionSiguienteMes)],
      ],
      theme: 'striped', headStyles: { fillColor: [230, 230, 230], textColor: 0 },
      margin: { left: margin, right: margin }
    });
    currentY = doc.lastAutoTable.finalY + 30;

    // Gráfico de Evolución
    doc.setFontSize(14).setFont(undefined, 'bold').text("Evolución de Gastos", margin, currentY);
    currentY += 15;
    const chartWidth = pageWidth - (margin * 2);
    const chartHeight = chartWidth * 0.5;
    if (canvases.line) {
      doc.addImage(canvases.line.toDataURL('image/png'), 'PNG', margin, currentY, chartWidth, chartHeight);
    } else {
      doc.setFontSize(10).setFont(undefined, 'italic').text("No hay datos de evolución para el período seleccionado.", margin, currentY + 20);
    }

    // --- PÁGINA 2 ---
    doc.addPage();
    currentY = 80;

    // Gráficos de Rankings
    doc.setFontSize(14).setFont(undefined, 'bold').text("Rankings y Desgloses (Histórico)", margin, currentY);
    currentY += 20;
    
    const halfWidth = (pageWidth - (margin * 2) - 20) / 2;
    const halfHeight = halfWidth;

    // Top Categorías
    if (canvases.bar) {
      doc.addImage(canvases.bar.toDataURL('image/png'), 'PNG', margin, currentY, halfWidth, halfHeight);
    }
    // Top Responsables
    if (canvases.topGastadores) {
      doc.addImage(canvases.topGastadores.toDataURL('image/png'), 'PNG', margin + halfWidth + 20, currentY, halfWidth, halfHeight);
    }
    currentY += halfHeight + 20;

    // Top Clientes
    if (canvases.topClientes) {
      doc.addImage(canvases.topClientes.toDataURL('image/png'), 'PNG', margin, currentY, halfWidth, halfHeight);
    } else {
      doc.setFontSize(10).setFont(undefined, 'italic').text("No hay gastos asociados a clientes.", margin, currentY + (halfHeight / 2));
    }
    // Top Transportes
    if (canvases.topTransportes) {
      doc.addImage(canvases.topTransportes.toDataURL('image/png'), 'PNG', margin + halfWidth + 20, currentY, halfWidth, halfHeight);
    } else {
      doc.setFontSize(10).setFont(undefined, 'italic').text("No hay gastos asociados a transportes.", margin + halfWidth + 20, currentY + (halfHeight / 2));
    }

    // --- PÁGINA 3 (Opcional) - Tablas de Datos ---
    doc.addPage();
    currentY = 80;
    doc.setFontSize(14).setFont(undefined, 'bold').text("Tablas de Datos Detallados", margin, currentY);
    currentY += 20;

    // Tabla de Categorías
    doc.autoTable({
      startY: currentY,
      head: [['Top Categorías', 'Monto Total']],
      body: rawData.value.categorias.map(item => [item.tipo_gasto, formatCurrency(item.total_gastado)]),
      theme: 'grid', headStyles: { fillColor: [230, 230, 230], textColor: 0 },
      margin: { left: margin, right: margin }
    });
    currentY = doc.lastAutoTable.finalY + 20;

    // Tabla de Responsables
    doc.autoTable({
      startY: currentY,
      head: [['Top Responsables', 'Monto Total']],
      body: rawData.value.responsables.map(item => [item.nombre_responsable, formatCurrency(item.total_gastado)]),
      theme: 'grid', headStyles: { fillColor: [230, 230, 230], textColor: 0 },
      margin: { left: margin, right: margin }
    });

    // Aplicar encabezado y pie de página a todas las páginas
    addHeaderAndFooter();

    doc.save(`Reporte_Analiticas_${new Date().toISOString().split('T')[0]}.pdf`);

  } catch (e) {
    console.error("Error al exportar a PDF:", e);
    alert("Hubo un error al generar el PDF.");
  } finally {
    exportandoPDF.value = false;
  }
}
</script>
<template>
  <div class="bg-gray-100/50 min-h-screen">
    <div class="container mx-auto px-4 py-8">
      
      <div class="flex flex-col sm:flex-row justify-between items-center mb-6">
        <div>
          <h1 class="text-3xl sm:text-4xl font-bold text-gray-800 tracking-tight">
            Dashboard de Analíticas
          </h1>
          <p class="mt-1 text-gray-600">Resumen de la actividad de gastos.</p>
        </div>
        <button @click="exportarAPDF" :disabled="exportandoPDF" class="btn btn-danger mt-4 sm:mt-0">
          <span v-if="exportandoPDF" class="flex items-center">
            <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            Exportando...
          </span>
          <span v-else class="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
            Exportar a PDF
          </span>
        </button>
      </div>

      <section class="mb-8 p-4 bg-white rounded-xl shadow-lg border">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label for="fechaDesde" class="form-label">Fecha Desde</label>
            <input type="date" v-model="fechaDesde" id="fechaDesde" class="form-input">
          </div>
          <div>
            <label for="fechaHasta" class="form-label">Fecha Hasta</label>
            <input type="date" v-model="fechaHasta" id="fechaHasta" class="form-input">
          </div>
          <div>
            <label for="agrupador" class="form-label">Agrupar Evolución por</label>
            <select v-model="agrupadorEvolucion" id="agrupador" class="form-input">
              <option value="day">Día</option>
              <option value="week">Semana</option>
              <option value="month">Mes</option>
            </select>
          </div>
          <div>
            <button @click="loadAllAnalyticsData" class="btn-primary w-full" :disabled="loading">
              <span v-if="loading">Cargando...</span>
              <span v-else>Aplicar Filtros</span>
            </button>
          </div>
        </div>
      </section>

      <div v-if="loading" class="text-center py-20">
        <svg class="animate-spin h-12 w-12 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <p class="mt-4 text-lg text-gray-600">Cargando datos de analíticas...</p>
      </div>
      <div v-else-if="error" class="error-banner">{{ error }}</div>
      
      <div v-else id="dashboard-analytics" class="space-y-8">
        <section>
          <h2 class="section-title">Indicadores Clave</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div class="kpi-card">
              <p class="kpi-label">Gasto Total en Período</p>
              <p class="kpi-value">{{ formatCurrency(kpis.totalGastadoPeriodo) }}</p>
            </div>
            <div class="kpi-card">
              <p class="kpi-label">Gasto Promedio Mensual</p>
              <p class="kpi-value">{{ formatCurrency(kpis.promedioMensual) }}</p>
              <p class="kpi-description">(Histórico 12 meses)</p>
            </div>
            <div class="kpi-card">
              <p class="kpi-label">Previsión Próximo Mes</p>
              <p class="kpi-value text-blue-600">{{ formatCurrency(kpis.previsionSiguienteMes) }}</p>
              <p class="kpi-description">(Promedio últimos 3 meses)</p>
            </div>
            <div class="kpi-card">
              <p class="kpi-label">Categoría Principal</p>
              <p class="kpi-value truncate" :title="kpis.categoriaPrincipal.tipo">{{ kpis.categoriaPrincipal.tipo }}</p>
            </div>
          </div>
        </section>

        <div class="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <section class="section-container lg:col-span-3">
            <h2 class="section-title">Evolución de Gastos</h2>
            <div id="line-chart-container" class="chart-container-wrapper h-96">
              <LineChart v-if="lineChartData" :data="lineChartData" :options="lineChartOptions" />
              <div v-else class="no-data-placeholder">No hay datos en el período seleccionado.</div>
            </div>
          </section>
          <section class="section-container lg:col-span-2">
            <h2 class="section-title">Top 7 Categorías</h2>
            <div id="bar-chart-container" class="chart-container-wrapper h-96">
              <Bar v-if="barChartData" :data="barChartData" :options="barChartOptions" />
              <div v-else class="no-data-placeholder">No hay datos de categorías.</div>
            </div>
          </section>
        </div>

        <section class="section-container">
          <h2 class="section-title">Ranking de Responsables por Gasto</h2>
          <div id="top-gastadores-chart-container" class="chart-container-wrapper h-96">
            <Bar v-if="topGastadoresChartData" :data="topGastadoresChartData" :options="{...horizontalBarOptions, plugins: {...horizontalBarOptions.plugins, title: {display: true, text: 'Top 5 Responsables (Histórico)'}}}" />
            <div v-else class="no-data-placeholder">No hay datos de responsables para mostrar.</div>
          </div>
        </section>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section class="section-container">
            <h2 class="section-title">Top 5 Clientes por Gasto Asociado</h2>
            <div id="top-clientes-chart-container" class="chart-container-wrapper h-80">
              <Bar v-if="topClientesChartData" :data="topClientesChartData" :options="{...horizontalBarOptions, plugins: {...horizontalBarOptions.plugins, title: {display: true, text: 'Gasto por Cliente (Histórico)'}}}" />
              <div v-else class="no-data-placeholder">No hay gastos asociados a clientes.</div>
            </div>
          </section>
          <section class="section-container">
            <h2 class="section-title">Top 5 Transportes por Gasto Asociado</h2>
            <div id="top-transportes-chart-container" class="chart-container-wrapper h-80">
              <Bar v-if="topTransportesChartData" :data="topTransportesChartData" :options="{...horizontalBarOptions, plugins: {...horizontalBarOptions.plugins, title: {display: true, text: 'Gasto por Transporte (Histórico)'}}}" />
              <div v-else class="no-data-placeholder">No hay gastos asociados a transportes.</div>
            </div>
          </section>
        </div>

      </div>
    </div>
  </div>
</template>
<style scoped>
.form-label { @apply block text-sm font-medium text-gray-700 mb-1; }
.form-input { @apply mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm; }
.section-title { @apply text-xl font-semibold text-gray-700 mb-4; }
.section-container { @apply bg-white p-6 rounded-xl shadow-lg border; }
.kpi-card { @apply bg-white p-6 rounded-xl shadow-lg border text-center; }
.kpi-label { @apply text-sm font-medium text-gray-500; }
.kpi-value { @apply text-3xl font-bold text-gray-800 mt-1; }
.kpi-description { @apply text-xs text-gray-500 mt-1; }
.chart-container-wrapper { @apply w-full relative; }
.no-data-placeholder { @apply flex justify-center items-center h-full text-center text-gray-500; }
.btn-primary { @apply w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50; }
.btn-danger { @apply inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-50; }
.error-banner { @apply p-4 bg-red-50 text-red-700 border border-red-200 rounded-md; }
</style>