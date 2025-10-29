<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { supabase } from '../../../supabaseClient';
import { formatCurrency } from '../../../utils/formatters.js';
import { Bar, Bubble } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, PointElement, LineElement } from 'chart.js';

import StatCard from '../StatCard.vue';
import vSelect from 'vue-select';
import 'vue-select/dist/vue-select.css';
import { ArrowDownTrayIcon } from '@heroicons/vue/24/outline';
import { useExcelExporter } from '../../../composables/useExcelExporter';

// Registro de Chart.js
ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, PointElement, LineElement);

// --- PROPS Y EMITS ---
const props = defineProps({
  perfilesOptions: { type: Array, required: true },
  loadingOptions: { type: Boolean, required: true },
});

const emit = defineEmits(['show-notification']);

const { exportToExcel } = useExcelExporter();

// --- ESTADO LOCAL DE LA PESTAÑA ---
const dashboardData = ref(null);
const loading = ref(true);
const error = ref('');
const filters = ref({
  fechaDesde: new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().split('T')[0],
  fechaHasta: new Date().toISOString().split('T')[0],
  selectedResponsable: null,
});

const insightsData = ref(null);
const loadingInsights = ref(false);

// --- LÓGICA DE CARGA DE DATOS ---
async function fetchData() {
  loading.value = true;
  error.value = '';
  try {
    const params = {
      p_start_date: filters.value.fechaDesde,
      p_end_date: filters.value.fechaHasta,
      p_user_id: filters.value.selectedResponsable?.code || null 
    };
    const { data, error: rpcError } = await supabase.rpc('get_dashboard_analisis_rendiciones', params);
    if (rpcError) throw rpcError;
    dashboardData.value = data;
  } catch(e) {
    console.error("Error al cargar análisis de rendiciones:", e);
    error.value = `Error al cargar análisis de rendiciones: ${e.message}`;
  } finally {
    loading.value = false;
  }
}

async function fetchInsights(responsable) {
  if (!responsable) {
    insightsData.value = null;
    return;
  }
  loadingInsights.value = true;
  try {
    const { data, error: rpcError } = await supabase.rpc('get_responsable_rendicion_insights', {
      p_user_id: responsable.code,
      p_start_date: filters.value.fechaDesde,
      p_end_date: filters.value.fechaHasta
    });
    if (rpcError) throw rpcError;
    insightsData.value = data;
  } catch (e) {
    console.error("Error al cargar insights del responsable:", e);
    emit('show-notification', 'Error', 'No se pudieron cargar los insights de comportamiento.', 'error');
    insightsData.value = null;
  } finally {
    loadingInsights.value = false;
  }
}

// --- COMPUTED PROPERTIES ---
const chartColors = ['#3b82f6', '#10b981', '#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#64748b'];
const kpis = computed(() => dashboardData.value?.kpis);
const eficienciaData = computed(() => dashboardData.value?.tabla_eficiencia || []);

const efficiencyBarChartData = computed(() => {
  if (!eficienciaData.value.length) return null;
  const labels = eficienciaData.value.map(item => item.responsable_nombre);
  const costoPromedioData = eficienciaData.value.map(item => item.costo_promedio);
  const promedioGeneral = dashboardData.value?.costo_promedio_general || 0;

  return {
    labels,
    datasets: [
      {
        label: 'Costo Promedio por Rendición',
        data: costoPromedioData,
        backgroundColor: '#3b82f6',
        borderRadius: 4,
      },
      {
        label: 'Promedio General',
        data: Array(labels.length).fill(promedioGeneral),
        type: 'line',
        borderColor: '#ef4444',
        borderWidth: 2,
        pointRadius: 0,
        borderDash: [5, 5],
      }
    ]
  };
});

const efficiencyBubbleChartData = computed(() => {
  if (!eficienciaData.value.length) return null;
  const maxTotal = Math.max(...eficienciaData.value.map(item => item.costo_total), 0);
  
  return {
    datasets: eficienciaData.value.map((item, index) => ({
      label: item.responsable_nombre,
      data: [{
        x: item.duracion_promedio,
        y: item.costo_promedio,
        r: 5 + (item.costo_total / maxTotal) * 25
      }],
      backgroundColor: `${chartColors[index % chartColors.length]}B3`,
    }))
  };
});

const efficiencyBubbleChartOptions = computed(() => ({
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: function(context) {
          const item = eficienciaData.value[context.datasetIndex];
          return [
            `Responsable: ${item.responsable_nombre}`,
            `Costo Promedio: ${formatCurrency(item.costo_promedio)}`,
            `Duración Promedio: ${item.duracion_promedio} días`,
            `Total Gastado: ${formatCurrency(item.costo_total)}`
          ];
        }
      }
    }
  },
  scales: {
    x: { title: { display: true, text: 'Duración Promedio (días)' } },
    y: { title: { display: true, text: 'Costo Promedio por Rendición' }, ticks: { callback: (val) => formatCurrency(val) } }
  }
}));

// --- LÓGICA DE EXPORTACIÓN ---
const handleExport = () => {
  emit('show-notification', 'Exportando', 'Preparando tu reporte...', 'info');
  try {
    const dataToExport = eficienciaData.value;
    const sheets = [{ name: 'Eficiencia por Responsable', data: dataToExport }];
    exportToExcel(sheets, 'eficiencia_por_responsable');
    setTimeout(() => { emit('show-notification', 'Éxito', 'Reporte de eficiencia generado.', 'success'); }, 500);
  } catch (e) {
    emit('show-notification', 'Error', 'No se pudo generar el reporte.', 'error');
    console.error("Error al exportar:", e);
  }
};

// --- WATCHERS Y CICLO DE VIDA ---
onMounted(fetchData);

// CORRECCIÓN DEFINITIVA: Se usan watchers específicos para cada filtro.
// Watcher para las fechas
watch(() => [filters.value.fechaDesde, filters.value.fechaHasta], () => {
  fetchData();
  // Si hay un responsable seleccionado, también actualizamos sus insights con las nuevas fechas
  if (filters.value.selectedResponsable) {
    fetchInsights(filters.value.selectedResponsable);
  }
});

// Watcher para el responsable
watch(() => filters.value.selectedResponsable, (newResponsable) => {
  fetchData(); // Recargamos los datos principales (KPIs, gráficos, tabla)
  fetchInsights(newResponsable); // Recargamos los insights para el nuevo responsable
});
</script>
<template>
  <div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div><label class="form-label">Fecha Desde</label><input type="date" v-model="filters.fechaDesde" class="form-input"></div>
      <div><label class="form-label">Fecha Hasta</label><input type="date" v-model="filters.fechaHasta" class="form-input"></div>
      <div>
        <label class="form-label">Responsable</label>
        <v-select 
          v-model="filters.selectedResponsable"
          :options="perfilesOptions" 
          :loading="loadingOptions" 
          placeholder="Todos" 
          class="v-select-filter bg-white"
          :class="{ 'filter-active': filters.selectedResponsable }"
          label="label"
          track-by="code"
        ></v-select>
      </div>
    </div>
    <div v-if="loading && !dashboardData" class="text-center py-20"><svg class="animate-spin h-12 w-12 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>
    <div v-else-if="error" class="error-banner">{{ error }}</div>
    <div v-else class="space-y-8">
      <section><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Costo Promedio / Rendición" :value="kpis?.costo_promedio" formatAs="currency" :loading="loading" />
        <StatCard title="Duración Promedio" :value="kpis?.duracion_promedio" :suffix="kpis?.duracion_promedio === 1 ? ' día' : ' días'" :loading="loading" />
        <StatCard title="Rendiciones Procesadas" :value="kpis?.total_rendiciones" :loading="loading" />
        <StatCard title="Total Gastado" :value="kpis?.costo_total" formatAs="currency" :loading="loading" />
      </div></section>
      
      <section v-if="filters.selectedResponsable" class="section-container bg-indigo-50 border-indigo-200">
        <h2 class="section-title text-indigo-800">Insights de Comportamiento para: {{ filters.selectedResponsable.label }}</h2>
        <div v-if="loadingInsights" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div v-for="i in 4" :key="i" class="h-24 bg-gray-200 rounded-lg animate-pulse"></div>
        </div>
        <div v-else-if="insightsData" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="insight-card">
            <p class="insight-text">Sus días de mayor gasto suelen ser los <span class="insight-highlight">{{ insightsData.dias_mayor_gasto?.join(' y ') || 'N/A' }}</span>.</p>
          </div>
          <div class="insight-card">
            <p class="insight-text">Generalmente, rinde sus adelantos los días <span class="insight-highlight">{{ insightsData.dia_cierre_comun || 'N/A' }}</span>.</p>
          </div>
          
          <!-- INICIO: Tarjeta de Insight Modificada -->
          <div class="insight-card">
            <p class="insight-text">Sus gastos se concentran más en <span class="insight-highlight">{{ insightsData.tipo_gasto_principal || 'N/A' }}</span>.</p>
            <div v-if="insightsData.gasto_mas_alto" class="text-xs text-gray-500 mt-2 space-y-1">
              <p>
                <span class="font-semibold">Gasto más alto:</span> {{ formatCurrency(insightsData.gasto_mas_alto.monto_total) }}
              </p>
              <p>
                <span class="font-semibold">Tipo:</span> {{ insightsData.gasto_mas_alto.nombre_tipo_gasto }}
              </p>
              <p>
                <span class="font-semibold">Descripción:</span> "{{ insightsData.gasto_mas_alto.descripcion_general }}"
              </p>
              <p>
                <span class="font-semibold">Rendición:</span> #{{ insightsData.gasto_mas_alto.codigo_rendicion }}
              </p>
            </div>
          </div>
          <!-- FIN: Tarjeta de Insight Modificada -->

          <div class="insight-card">
            <p class="insight-text">Registra la mayoría de sus gastos en el sistema los días <span class="insight-highlight">{{ insightsData.dia_registro_comun || 'N/A' }}</span>.</p>
          </div>
        </div>
      </section>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section class="section-container">
          <h2 class="section-title">Costo Promedio por Responsable</h2>
          <div class="h-96">
            <Bar v-if="efficiencyBarChartData" :data="efficiencyBarChartData" :options="{ responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: true, position: 'bottom' } } }" />
            <div v-else class="no-data-placeholder h-full"><p>No hay datos para mostrar.</p></div>
          </div>
        </section>
        <section class="section-container">
          <h2 class="section-title">Matriz de Eficiencia (Costo vs. Duración)</h2>
          <div class="h-96">
            <Bubble v-if="efficiencyBubbleChartData" :data="efficiencyBubbleChartData" :options="efficiencyBubbleChartOptions" />
            <div v-else class="no-data-placeholder h-full"><p>No hay datos para mostrar.</p></div>
          </div>
        </section>
      </div>

      <section class="section-container">
          <div class="flex justify-between items-center mb-4">
              <h2 class="section-title !mb-0">Eficiencia por Responsable</h2>
              <button @click="handleExport" class="btn-primary btn-sm inline-flex items-center gap-2">
                  <ArrowDownTrayIcon class="h-4 w-4"/>Exportar
              </button>
          </div>
          <div class="overflow-x-auto">
              <table class="min-w-full">
                  <thead>
                      <tr>
                          <th class="table-header">Responsable</th>
                          <th class="table-header text-right"># Rend.</th>
                          <th class="table-header text-right">Costo Total</th>
                          <th class="table-header text-right">Duración Prom. (Días)</th>
                          <th class="table-header text-right bg-blue-50/50">Costo Diario Promedio</th>
                      </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-200">
                      <tr v-for="item in eficienciaData" :key="item.responsable_id" class="hover:bg-gray-50">
                          <td class="table-cell font-medium">{{ item.responsable_nombre }}</td>
                          <td class="table-cell text-right">{{ item.cantidad_rendiciones }}</td>
                          <td class="table-cell text-right">{{ formatCurrency(item.costo_total) }}</td>
                          <td class="table-cell text-right">{{ item.duracion_promedio }}</td>
                          <td class="table-cell text-right font-bold text-blue-700 bg-blue-50/50">
                              {{ formatCurrency(item.costo_diario_promedio) }}
                          </td>
                      </tr>
                      <tr v-if="eficienciaData.length === 0">
                          <td colspan="5" class="text-center py-10 text-gray-500">No hay datos de eficiencia para el período seleccionado.</td>
                      </tr>
                  </tbody>
              </table>
          </div>
      </section>
    </div>
  </div>
</template>
<style>
/* Estilo para resaltar el filtro cuando está activo */
.filter-active {
  --vs-border-color: #3b82f6;
  --vs-ring-color: #3b82f6;
}
.filter-active .vs__dropdown-toggle {
  border-color: var(--vs-border-color);
  box-shadow: 0 0 0 2px var(--vs-ring-color);
}

/* Estilos para las nuevas tarjetas de insights */
.insight-card {
  @apply bg-white/60 p-4 rounded-lg shadow-sm;
}
.insight-text {
  @apply text-sm text-gray-700;
}
.insight-highlight {
  @apply font-bold text-indigo-700;
}
</style>
